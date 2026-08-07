use bytes::{Buf, BufMut, BytesMut};
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Frame {
    Output(Vec<u8>),
    Input(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Exit(i32),
    Error(String),
    Ping,
    Pong,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodecError {
    EmptyFrame,
    UnknownOpcode(u8),
    InvalidPayloadLength,
    InvalidUtf8,
    PayloadTooLarge(usize),
}

impl fmt::Display for CodecError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CodecError::EmptyFrame => write!(f, "Empty frame received"),
            CodecError::UnknownOpcode(op) => write!(f, "Unknown frame opcode: {:#04x}", op),
            CodecError::InvalidPayloadLength => write!(f, "Invalid payload length for frame"),
            CodecError::InvalidUtf8 => write!(f, "Invalid UTF-8 payload"),
            CodecError::PayloadTooLarge(sz) => {
                write!(f, "Frame payload exceeds limit: {} bytes", sz)
            }
        }
    }
}

impl std::error::Error for CodecError {}

pub const MAX_FRAME_PAYLOAD_SIZE: usize = 1024 * 1024; // 1 MiB upper bound

pub const OPCODE_OUTPUT: u8 = 0x00;
pub const OPCODE_INPUT: u8 = 0x01;
pub const OPCODE_RESIZE: u8 = 0x02;
pub const OPCODE_EXIT: u8 = 0x03;
pub const OPCODE_ERROR: u8 = 0x04;
pub const OPCODE_PING: u8 = 0x05;
pub const OPCODE_PONG: u8 = 0x06;

pub fn encode_frame(frame: &Frame) -> Vec<u8> {
    match frame {
        Frame::Output(data) => {
            let mut buf = Vec::with_capacity(1 + data.len());
            buf.push(OPCODE_OUTPUT);
            buf.extend_from_slice(data);
            buf
        }
        Frame::Input(data) => {
            let mut buf = Vec::with_capacity(1 + data.len());
            buf.push(OPCODE_INPUT);
            buf.extend_from_slice(data);
            buf
        }
        Frame::Resize { cols, rows } => {
            let mut buf = BytesMut::with_capacity(5);
            buf.put_u8(OPCODE_RESIZE);
            buf.put_u16(*cols);
            buf.put_u16(*rows);
            buf.to_vec()
        }
        Frame::Exit(code) => {
            let mut buf = BytesMut::with_capacity(5);
            buf.put_u8(OPCODE_EXIT);
            buf.put_i32(*code);
            buf.to_vec()
        }
        Frame::Error(msg) => {
            let bytes = msg.as_bytes();
            let mut buf = Vec::with_capacity(1 + bytes.len());
            buf.push(OPCODE_ERROR);
            buf.extend_from_slice(bytes);
            buf
        }
        Frame::Ping => vec![OPCODE_PING],
        Frame::Pong => vec![OPCODE_PONG],
    }
}

pub fn decode_frame(data: &[u8]) -> Result<Frame, CodecError> {
    if data.is_empty() {
        return Err(CodecError::EmptyFrame);
    }

    if data.len() > MAX_FRAME_PAYLOAD_SIZE {
        return Err(CodecError::PayloadTooLarge(data.len()));
    }

    let opcode = data[0];
    let payload = &data[1..];

    match opcode {
        OPCODE_OUTPUT => Ok(Frame::Output(payload.to_vec())),
        OPCODE_INPUT => Ok(Frame::Input(payload.to_vec())),
        OPCODE_RESIZE => {
            if payload.len() != 4 {
                return Err(CodecError::InvalidPayloadLength);
            }
            let mut buf = payload;
            let cols = buf.get_u16();
            let rows = buf.get_u16();
            Ok(Frame::Resize { cols, rows })
        }
        OPCODE_EXIT => {
            if payload.len() != 4 {
                return Err(CodecError::InvalidPayloadLength);
            }
            let mut buf = payload;
            let code = buf.get_i32();
            Ok(Frame::Exit(code))
        }
        OPCODE_ERROR => {
            let msg = std::str::from_utf8(payload).map_err(|_| CodecError::InvalidUtf8)?;
            Ok(Frame::Error(msg.to_string()))
        }
        OPCODE_PING => Ok(Frame::Ping),
        OPCODE_PONG => Ok(Frame::Pong),
        unknown => Err(CodecError::UnknownOpcode(unknown)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_term_001_codec_encode_decode_roundtrip() {
        let frames = vec![
            Frame::Output(b"Hello Terminal".to_vec()),
            Frame::Input(b"ls -la\n".to_vec()),
            Frame::Resize {
                cols: 120,
                rows: 40,
            },
            Frame::Exit(0),
            Frame::Exit(-1),
            Frame::Error("Something went wrong".to_string()),
            Frame::Ping,
            Frame::Pong,
        ];

        for f in frames {
            let encoded = encode_frame(&f);
            let decoded = decode_frame(&encoded).expect("Decode should succeed");
            assert_eq!(f, decoded);
        }
    }

    #[test]
    fn test_term_002_codec_invalid_inputs() {
        // Empty frame
        assert_eq!(decode_frame(&[]), Err(CodecError::EmptyFrame));

        // Unknown opcode
        assert_eq!(decode_frame(&[0xFF]), Err(CodecError::UnknownOpcode(0xFF)));

        // Invalid RESIZE length
        assert_eq!(
            decode_frame(&[OPCODE_RESIZE, 0, 80]),
            Err(CodecError::InvalidPayloadLength)
        );

        // Invalid EXIT length
        assert_eq!(
            decode_frame(&[OPCODE_EXIT, 0, 0]),
            Err(CodecError::InvalidPayloadLength)
        );

        // Invalid UTF-8 in ERROR
        assert_eq!(
            decode_frame(&[OPCODE_ERROR, 0xFF, 0xFE]),
            Err(CodecError::InvalidUtf8)
        );
    }
}
