use serde::Serialize;
use zip::result::ZipError;

#[derive(Debug, Clone, Serialize)]
pub struct HTTPulseError {
    message: String,
    category: String,
}

impl From<sea_orm::DbErr> for HTTPulseError {
    fn from(error: sea_orm::DbErr) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "seaOrm".to_string(),
        }
    }
}
impl From<hyper::http::Error> for HTTPulseError {
    fn from(error: hyper::http::Error) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "http".to_string(),
        }
    }
}
impl From<hyper::Error> for HTTPulseError {
    fn from(error: hyper::Error) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "http".to_string(),
        }
    }
}
impl From<tauri::http::InvalidUri> for HTTPulseError {
    fn from(error: tauri::http::InvalidUri) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "invalidUri".to_string(),
        }
    }
}
impl From<hyper::header::InvalidHeaderValue> for HTTPulseError {
    fn from(error: hyper::header::InvalidHeaderValue) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "invalidHeader".to_string(),
        }
    }
}

impl From<hyper::header::InvalidHeaderName> for HTTPulseError {
    fn from(error: hyper::header::InvalidHeaderName) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "invalidHeaderName".to_string(),
        }
    }
}

impl From<hyper::header::ToStrError> for HTTPulseError {
    fn from(error: hyper::header::ToStrError) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "toStrError".to_string(),
        }
    }
}

impl From<std::io::Error> for HTTPulseError {
    fn from(error: std::io::Error) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "io".to_string(),
        }
    }
}
impl From<cookie_store::Error> for HTTPulseError {
    fn from(error: cookie_store::Error) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "cookieStore".to_string(),
        }
    }
}

impl From<url::ParseError> for HTTPulseError {
    fn from(error: url::ParseError) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "urlParse".to_string(),
        }
    }
}

impl From<cookie_store::CookieError> for HTTPulseError {
    fn from(error: cookie_store::CookieError) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "cookieStore".to_string(),
        }
    }
}

impl From<serde_json::Error> for HTTPulseError {
    fn from(error: serde_json::Error) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "serdeJson".to_string(),
        }
    }
}

impl From<base64::DecodeError> for HTTPulseError {
    fn from(error: base64::DecodeError) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "base64".to_string(),
        }
    }
}

impl From<ZipError> for HTTPulseError {
    fn from(error: ZipError) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "zip".to_string(),
        }
    }
}
impl From<cookie::ParseError> for HTTPulseError {
    fn from(error: cookie::ParseError) -> Self {
        HTTPulseError {
            message: error.to_string(),
            category: "cookie".to_string(),
        }
    }
}

