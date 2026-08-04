use std::ffi::CString;
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tracing::{error, info};

/// Raw PTY implementation using nix/libc — works on both Linux and Android (Termux).
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
        // Set initial window size
        let win_size = libc::winsize {
            ws_row: rows,
            ws_col: cols,
            ws_xpixel: 0,
            ws_ypixel: 0,
        };

        // Use forkpty to create a PTY + child process in one call
        let fork_result = unsafe {
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

        let (pid, raw_master_fd) = fork_result;

        if pid == 0 {
            // ===== CHILD PROCESS =====
            // Change working directory if specified
            if let Some(ref dir) = work_dir {
                let _ = std::env::set_current_dir(dir);
            }

            let shell = custom_shell
                .or_else(|| std::env::var("SHELL").ok())
                .unwrap_or_else(|| {
                    // Auto-detect shell for Termux vs regular Linux
                    if std::path::Path::new("/data/data/com.termux/files/usr/bin/bash").exists() {
                        "/data/data/com.termux/files/usr/bin/bash".to_string()
                    } else if std::path::Path::new("/bin/bash").exists() {
                        "/bin/bash".to_string()
                    } else {
                        "/bin/sh".to_string()
                    }
                });

            let shell_c = CString::new(shell.as_str()).unwrap();
            let login_arg = CString::new("-l").unwrap();

            // Set TERM environment variable
            let term_key = CString::new("TERM").unwrap();
            let term_val = CString::new("xterm-256color").unwrap();
            unsafe { libc::setenv(term_key.as_ptr(), term_val.as_ptr(), 1); }

            // exec the shell as login shell
            unsafe {
                libc::execvp(
                    shell_c.as_ptr(),
                    [shell_c.as_ptr(), login_arg.as_ptr(), std::ptr::null()].as_ptr(),
                );
                // If exec fails, exit
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

        // Background reader thread
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader_file.read(&mut buf) {
                    Ok(0) => {
                        info!("PTY EOF reached");
                        break;
                    }
                    Ok(n) => {
                        if output_tx.blocking_send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        // EIO is expected when the child exits on Linux PTY
                        if e.raw_os_error() == Some(libc::EIO) {
                            info!("PTY child exited (EIO)");
                        } else {
                            error!("Error reading from PTY: {}", e);
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
