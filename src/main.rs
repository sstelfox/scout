extern crate actix;
extern crate actix_web;
extern crate dotenv;
extern crate env_logger;
extern crate mime;
extern crate serde_json;

#[macro_use]
extern crate serde_derive;

#[macro_use]
extern crate log;

use dotenv::dotenv;

use actix_web::{server, App, HttpResponse, HttpRequest, Responder};
use actix_web::fs::{NamedFile, StaticFileConfig};
use actix_web::http::Method;
use actix_web::http::header::DispositionType;
use actix_web::middleware::Logger;

/**
 *  Data structures
 */

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
enum AnalyticData {
    #[serde(rename = "start")]
    RequestStart {
        #[serde(rename = "ts")]
        timestamp: usize,

        #[serde(rename = "bfs")]
        browser_first_seen: usize,

        #[serde(rename = "sfs")]
        session_first_seen: usize,

        title: String,
        url: String,
    },

    #[serde(rename = "end")]
    RequestEnd {
        #[serde(rename = "ts")]
        timestamp: usize,
    },

    #[serde(rename = "performance")]
    Performance {
        #[serde(rename = "ts")]
        timestamp: usize,

        #[serde(rename = "perfEntry")]
        entry: PerfEntry,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct AnalyticRequest {
    #[serde(rename = "bid")]
    browser_id: usize,

    #[serde(rename = "sid")]
    session_id: usize,

    #[serde(rename = "svc")]
    session_view_count: usize,

    #[serde(rename = "ts")]
    timestamp: usize,

    //data: Vec<AnalyticData>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ErrorReport {
    msg: String,
    stack: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "entryType")]
enum PerfEntry {
    #[serde(rename = "navigate")]
    Navigate {
    },

    #[serde(rename = "navigation")]
    Navigation {
        name: String,
    },

    #[serde(rename = "paint")]
    Paint {
        duration: f64,
        name: String,

        #[serde(rename = "startTime")]
        start_time: f64,
    },

    #[serde(rename = "reload")]
    Reload {
    },

    #[serde(rename = "resource")]
    Resource {
    },
}

#[derive(Default)]
struct FixedInlineFileConfig;

impl StaticFileConfig for FixedInlineFileConfig {
    fn content_disposition_map(_type: mime::Name) -> DispositionType {
        DispositionType::Inline
    }
}

fn analytics_handling(body: String) -> impl Responder {
    let d: AnalyticRequest = serde_json::from_str(&body).unwrap();
    info!("{:?}", d);

    // Always return a minimal valid JSON reseponse, the client will never be
    // able to receive this anyway
    HttpResponse::Ok().body("{}")
}

fn error_report_handling(body: String) -> impl Responder {
    let d: ErrorReport = serde_json::from_str(&body).unwrap();
    info!("{:?}", d);

    // Always return a minimal valid JSON reseponse, the client will never be
    // able to receive this anyway
    HttpResponse::Ok().body("{}")
}

fn shared_worker_script(_req: &HttpRequest) -> impl Responder {
    NamedFile::open_with_config("static/js/worker.js", FixedInlineFileConfig)
}

fn tracking_script(_req: &HttpRequest) -> impl Responder {
    NamedFile::open_with_config("static/js/track.js", FixedInlineFileConfig)
}

fn main() {
    dotenv().ok();
    env_logger::init();

    info!("Starting HTTP server at 127.0.0.1:9292");

    // TODO: Add security headers
    server::new(|| {
        App::new()
            .middleware(Logger::default())
            .resource("/t/1/t.js", |r| r.method(Method::GET).f(tracking_script))
            .resource("/t/1/w.js", |r| r.method(Method::GET).f(shared_worker_script))
            .resource("/t/1/ana", |r| r.method(Method::POST).with(analytics_handling))
            .resource("/t/1/err", |r| r.method(Method::POST).with(error_report_handling))
    })
        .bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .run();
}
