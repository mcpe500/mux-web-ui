use std::ffi::CString;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tracing::{error, info};

/// Raw PTY implementation using nix/libc — works on both Linux and Android (Termux).
/// Fork-safe: resolves all paths/strings BEFORE forking. Child only does libc calls.
pub struct PtySession {
    master_fd: Arc<OwnedFd>,
    child_pid: nix::unistd::Pid,
    writer: Arc<Mutex<std::fs::File>>,
}

impl PtySession {
    pub fn new(
        cols: u16,
        rows: u16,
        work_dir: Option<PathBuf>,
        custom_shell: Option<String>,
        output_tx: mpsc::Sender<Vec<u8>>,
        exit_tx: mpsc::Sender<i32>,
    ) -> Result<Self, String> {
        // ===== RESOLVE EVERYTHING BEFORE FORK (fork-safe) =====

        // Resolve shell path
        let shell = custom_shell
            .or_else(|| std::env::var("SHELL").ok())
            .unwrap_or_else(|| {
                // Auto-detect shell for Termux vs regular Linux
                for candidate in &[
                    "/data/data/com.termux/files/usr/bin/bash",
                    "/data/data/com.termux/files/usr/bin/sh",
                    "/bin/bash",
                    "/bin/sh",
                ] {
                    if std::path::Path::new(candidate).exists() {
                        return candidate.to_string();
                    }
                }
                "/bin/sh".to_string()
            });

        // Pre-allocate CStrings before fork (heap allocation is unsafe after fork)
        let shell_cstr =
            CString::new(shell.as_str()).map_err(|e| format!("Invalid shell path: {}", e))?;

        let arg0_cstr =
            CString::new(shell.as_str()).map_err(|e| format!("Invalid shell arg0: {}", e))?;

        // Resolve work directory to a CString before fork
        let work_dir_cstr = if let Some(ref dir) = work_dir {
            let dir_str = dir.to_str().ok_or("Invalid work_dir path")?;
            Some(CString::new(dir_str).map_err(|e| format!("Invalid work_dir: {}", e))?)
        } else {
            None
        };

        // Pre-allocate env vars
        let term_key = CString::new("TERM").unwrap();
        let term_val = CString::new("xterm-256color").unwrap();

        // Set initial window size
        let win_size = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };

        // ===== OPEN PTY (manual openpty, fork-safe: no allocs before fork) =====
        // NOTE: we do NOT use libc::forkpty because its child inherits the
        // parent's fd table — including slave fds of OTHER concurrently-created
        // sessions. Those inherited slaves keep the master alive, so read()
        // never returns EIO and the exit is never detected (only flakes under
        // parallel session creation). We therefore close all inherited fds
        // in the child with close_range(3, UINT32_MAX).
        let raw_master_fd = unsafe {
            let fd = libc::posix_openpt(libc::O_RDWR | libc::O_NOCTTY | libc::O_CLOEXEC);
            if fd < 0 {
                return Err(format!(
                    "posix_openpt failed: {}",
                    std::io::Error::last_os_error()
                ));
            }
            if libc::grantpt(fd) != 0 {
                libc::close(fd);
                return Err(format!(
                    "grantpt failed: {}",
                    std::io::Error::last_os_error()
                ));
            }
            if libc::unlockpt(fd) != 0 {
                libc::close(fd);
                return Err(format!(
                    "unlockpt failed: {}",
                    std::io::Error::last_os_error()
                ));
            }
            if libc::ioctl(fd, libc::TIOCSWINSZ, &win_size as *const libc::winsize) != 0 {
                libc::close(fd);
                return Err(format!(
                    "TIOCSWINSZ failed: {}",
                    std::io::Error::last_os_error()
                ));
            }
            fd
        };

        // Slave fd for the child; parent closes its copy immediately after fork.
        let raw_slave_fd = unsafe {
            let name = libc::ptsname(raw_master_fd);
            if name.is_null() {
                libc::close(raw_master_fd);
                return Err(format!(
                    "ptsname failed: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let fd = libc::open(name, libc::O_RDWR | libc::O_NOCTTY | libc::O_CLOEXEC);
            if fd < 0 {
                libc::close(raw_master_fd);
                return Err(format!(
                    "open slave failed: {}",
                    std::io::Error::last_os_error()
                ));
            }
            fd
        };

        // Pre-allocated for the child's fd-closing fallback (fork-safe).
        // The open-fd upper bound is resolved in the PARENT (sysconf is not
        // guaranteed async-signal-safe) and capped so the child's worst-case
        // loop stays bounded.
        let fd_max = {
            let limit = unsafe { libc::sysconf(libc::_SC_OPEN_MAX) };
            if limit > 0 && limit < 1 << 20 {
                limit as i32
            } else {
                1024
            }
        };

        // ===== FORK =====
        let pid = unsafe { libc::fork() };
        if pid < 0 {
            let err = std::io::Error::last_os_error();
            unsafe {
                libc::close(raw_master_fd);
                libc::close(raw_slave_fd);
            }
            return Err(format!("fork failed: {}", err));
        }

        if pid == 0 {
            // ===== CHILD PROCESS =====
            // ONLY libc/syscall calls here — no Rust std allocations!

            unsafe {
                // New session + controlling tty (same as login_tty).
                libc::setsid();
                libc::ioctl(raw_slave_fd, libc::TIOCSCTTY, 0);

                libc::dup2(raw_slave_fd, 0);
                libc::dup2(raw_slave_fd, 1);
                libc::dup2(raw_slave_fd, 2);
                if raw_slave_fd > 2 {
                    libc::close(raw_slave_fd);
                }

                // Close every inherited fd (sibling sessions' slaves, sockets,
                // pipes, epoll fds...). This is what makes EIO reliable when
                // the child exits. If close_range is unavailable (kernel
                // < 5.9), fall back to a plain close() sweep: only the
                // async-signal-safe close(2) is used, bounded by the fd limit
                // resolved before forking (no malloc, no opendir).
                let ret = libc::syscall(libc::SYS_close_range, 3u32, u32::MAX, 0u32);
                if ret < 0 {
                    let mut fd = 3;
                    while fd < fd_max {
                        libc::close(fd);
                        fd += 1;
                    }
                }

                // Change working directory
                if let Some(ref dir_c) = work_dir_cstr {
                    libc::chdir(dir_c.as_ptr());
                }

                // Set TERM environment variable
                libc::setenv(term_key.as_ptr(), term_val.as_ptr(), 1);

                // Build argv: [shell, NULL] — interactive login shell
                let argv: [*const libc::c_char; 2] = [arg0_cstr.as_ptr(), std::ptr::null()];

                // exec the shell
                libc::execvp(shell_cstr.as_ptr(), argv.as_ptr());

                // If execvp returns, it failed — write error to stderr and exit
                let err_msg = b"mux-web: execvp failed\n";
                libc::write(2, err_msg.as_ptr() as *const libc::c_void, err_msg.len());
                libc::_exit(127);
            }
        }

        // ===== PARENT PROCESS =====
        unsafe { libc::close(raw_slave_fd) };
        let master_fd = unsafe { OwnedFd::from_raw_fd(raw_master_fd) };
        let master_fd = Arc::new(master_fd);

        // Create writer handle (dup the fd so we can read and write independently)
        let writer_raw_fd = unsafe { libc::dup(master_fd.as_raw_fd()) };
        if writer_raw_fd < 0 {
            return Err("Failed to dup master fd for writer".to_string());
        }
        // Defense-in-depth: keep every session fd out of future exec'd children
        // even if close_range in the child ever fails.
        unsafe { libc::fcntl(writer_raw_fd, libc::F_SETFD, libc::FD_CLOEXEC) };
        let writer_file = unsafe { std::fs::File::from_raw_fd(writer_raw_fd) };
        let writer = Arc::new(Mutex::new(writer_file));

        // Create reader handle
        let reader_raw_fd = unsafe { libc::dup(master_fd.as_raw_fd()) };
        if reader_raw_fd < 0 {
            return Err("Failed to dup master fd for reader".to_string());
        }
        unsafe { libc::fcntl(reader_raw_fd, libc::F_SETFD, libc::FD_CLOEXEC) };
        let mut reader_file = unsafe { std::fs::File::from_raw_fd(reader_raw_fd) };

        let child_pid = nix::unistd::Pid::from_raw(pid);

        info!("Spawned PTY child pid={} shell={}", pid, shell);

        // Background reader thread: forwards PTY output and reaps the child.
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader_file.read(&mut buf) {
                    Ok(0) => {
                        info!("PTY EOF reached (pid={})", pid);
                        break;
                    }
                    Ok(n) => {
                        if output_tx.blocking_send(buf[..n].to_vec()).is_err() {
                            info!("PTY output channel closed (pid={})", pid);
                            return;
                        }
                    }
                    Err(e) => {
                        // EIO is expected when the child exits on Linux/Android PTY
                        if e.raw_os_error() == Some(libc::EIO) {
                            info!("PTY child exited (EIO, pid={})", pid);
                        } else {
                            error!("Error reading from PTY (pid={}): {}", pid, e);
                        }
                        break;
                    }
                }
            }

            // Reap the child and report the exit code (B.8).
            let code = reap_exit_code(nix::unistd::Pid::from_raw(pid));
            let _ = exit_tx.blocking_send(code);
        });

        Ok(Self {
            master_fd,
            child_pid,
            writer,
        })
    }

    pub fn write_input(&self, data: &[u8]) -> Result<(), String> {
        let mut writer = self.writer.lock().unwrap();
        writer
            .write_all(data)
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY writer: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        let win_size = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };
        let ret = unsafe {
            libc::ioctl(
                self.master_fd.as_raw_fd(),
                libc::TIOCSWINSZ,
                &win_size as *const libc::winsize,
            )
        };
        if ret < 0 {
            Err(format!(
                "Failed to resize PTY: {}",
                std::io::Error::last_os_error()
            ))
        } else {
            Ok(())
        }
    }

    pub fn pid(&self) -> u32 {
        self.child_pid.as_raw() as u32
    }

    #[allow(dead_code)]
    pub fn kill(&self) -> Result<(), String> {
        self.terminate();
        Ok(())
    }

    pub fn terminate(&self) {
        let pid = self.child_pid;
        if nix::sys::signal::kill(pid, None).is_err() {
            return;
        }
        let _ = nix::sys::signal::kill(pid, nix::sys::signal::Signal::SIGTERM);
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(100);
        while std::time::Instant::now() < deadline {
            if nix::sys::signal::kill(pid, None).is_err() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        let _ = nix::sys::signal::kill(pid, nix::sys::signal::Signal::SIGKILL);
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.terminate();
    }
}

/// Block until the child is reaped and return its exit code
/// (128 + signal when killed by a signal, -1 when it cannot be determined).
fn reap_exit_code(pid: nix::unistd::Pid) -> i32 {
    use nix::sys::wait::{waitpid, WaitPidFlag, WaitStatus};
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        match waitpid(pid, Some(WaitPidFlag::WNOHANG)) {
            Ok(WaitStatus::Exited(_, code)) => return code,
            Ok(WaitStatus::Signaled(_, sig, _)) => return 128 + sig as i32,
            Ok(_) => {
                if std::time::Instant::now() >= deadline {
                    return -1;
                }
                std::thread::sleep(std::time::Duration::from_millis(20));
            }
            Err(nix::errno::Errno::ECHILD) => return -1,
            Err(_) => return -1,
        }
    }
}
