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
        let shell_cstr = CString::new(shell.as_str())
            .map_err(|e| format!("Invalid shell path: {}", e))?;

        let arg0_cstr = CString::new(shell.as_str())
            .map_err(|e| format!("Invalid shell arg0: {}", e))?;

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

        // ===== FORK =====
        let (pid, raw_master_fd) = unsafe {
            let mut master_fd: libc::c_int = -1;
            let pid = libc::forkpty(
                &mut master_fd as *mut libc::c_int,
                std::ptr::null_mut(),
                std::ptr::null(),
                &win_size as *const libc::winsize,
            );
            if pid < 0 {
                return Err(format!("forkpty failed: {}", std::io::Error::last_os_error()));
            }
            (pid, master_fd)
        };

        if pid == 0 {
            // ===== CHILD PROCESS =====
            // ONLY libc/syscall calls here — no Rust std allocations!

            unsafe {
                // Change working directory
                if let Some(ref dir_c) = work_dir_cstr {
                    libc::chdir(dir_c.as_ptr());
                }

                // Set TERM environment variable
                libc::setenv(term_key.as_ptr(), term_val.as_ptr(), 1);

                // Build argv: [shell, NULL] — interactive login shell
                let argv: [*const libc::c_char; 2] = [
                    arg0_cstr.as_ptr(),
                    std::ptr::null(),
                ];

                // exec the shell
                libc::execvp(shell_cstr.as_ptr(), argv.as_ptr());

                // If execvp returns, it failed — write error to stderr and exit
                let err_msg = b"mux-web: execvp failed\n";
                libc::write(2, err_msg.as_ptr() as *const libc::c_void, err_msg.len());
                libc::_exit(127);
            }
        }

        // ===== PARENT PROCESS =====
        let master_fd = unsafe { OwnedFd::from_raw_fd(raw_master_fd) };
        let master_fd = Arc::new(master_fd);

        // Create writer handle (dup the fd so we can read and write independently)
        let writer_raw_fd = unsafe { libc::dup(master_fd.as_raw_fd()) };
        if writer_raw_fd < 0 {
            return Err("Failed to dup master fd for writer".to_string());
        }
        let writer_file = unsafe { std::fs::File::from_raw_fd(writer_raw_fd) };
        let writer = Arc::new(Mutex::new(writer_file));

        // Create reader handle
        let reader_raw_fd = unsafe { libc::dup(master_fd.as_raw_fd()) };
        if reader_raw_fd < 0 {
            return Err("Failed to dup master fd for reader".to_string());
        }
        let mut reader_file = unsafe { std::fs::File::from_raw_fd(reader_raw_fd) };

        let child_pid = nix::unistd::Pid::from_raw(pid);

        info!("Spawned PTY child pid={} shell={}", pid, shell);

        // Background reader thread
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
                            break;
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
            .map_err(|e| format!("Failed to flush PTY writer: {}", e))
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

    pub fn kill(&self) -> Result<(), String> {
        nix::sys::signal::kill(self.child_pid, nix::sys::signal::Signal::SIGTERM)
            .map_err(|e| format!("Failed to kill PTY child process: {}", e))
    }
}
