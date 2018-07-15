extern crate actix;
extern crate actix_web;
extern crate dotenv;
extern crate env_logger;
extern crate serde_json;

#[macro_use]
extern crate serde_derive;

#[macro_use]
extern crate log;

use actix_web::http::{Method, StatusCode};
use actix_web::{App, fs, HttpRequest, HttpResponse, middleware, pred, Result, server};
use dotenv::dotenv;

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

    data: Vec<AnalyticData>,
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

/**
 * Analytics app portion
 */

fn analytics_handling(body: String) -> Result<HttpResponse> {
    info!("{}", body);

    let d: AnalyticRequest = serde_json::from_str(&body)?;
    info!("{:?}", d);

    // Always return a minimal valid JSON reseponse, the client will never be
    // able to receive this anyway
    Ok(HttpResponse::Ok().body("{}"))
}

fn error_report_handling(body: String) -> Result<HttpResponse> {
    let d: ErrorReport = serde_json::from_str(&body)?;
    info!("{:?}", d);

    // Always return a minimal valid JSON reseponse, the client will never be
    // able to receive this anyway
    Ok(HttpResponse::Ok().body("{}"))
}

fn api_not_found(_req: HttpRequest) -> HttpResponse {
    HttpResponse::NotFound().body("{}")
}

// Maybe check / set cookie here?
fn track_script(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/js/track.js")?)
}

fn analytics_tracker_app() -> App {
    return App::new()
        .middleware(middleware::Logger::default())
        .resource("/ana", |r| r.method(Method::POST).with(analytics_handling))
        .resource("/err", |r| r.method(Method::POST).with(error_report_handling))
        .resource("/t.js", |r| r.method(Method::GET).f(track_script))
        .default_resource( |r| {
            r.method(Method::GET).f(api_not_found);
            r.route().filter(pred::Not(pred::Get())).f( |_req| HttpResponse::MethodNotAllowed());
        });
}

/**
 *  Frontend app portion
 */

fn favicon(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/favicon.ico")?)
}

fn index(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/index.html")?)
}

fn not_found(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/404.html")?.set_status_code(StatusCode::NOT_FOUND))
}

fn page_one(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/page1.html")?)
}

fn page_two(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/page2.html")?)
}

fn frontend_app() -> App {
    return App::new()
        .middleware(middleware::Logger::default())
        .resource("/", |r| r.method(Method::GET).f(index))
        .resource("/favicon.ico", |r| r.method(Method::GET).f(favicon))
        .resource("/page1.html", |r| r.method(Method::GET).f(page_one))
        .resource("/page2.html", |r| r.method(Method::GET).f(page_two))
        .default_resource( |r| {
            r.method(Method::GET).f(not_found);
            r.route().filter(pred::Not(pred::Get())).f( |_req| HttpResponse::MethodNotAllowed() );
        });
}

/**
 *  Pull it all together
 */

fn main() {
    dotenv().ok();
    env_logger::init();

    let sys = actix::System::new("scout");

    // TODO: Add security headers
    server::new(move || vec![
        analytics_tracker_app().prefix("/t/1"),
        frontend_app(),
    ])
        .keep_alive(30)
        .bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .start();

    info!("Started HTTP server: 127.0.0.1:9292");

    let _ = sys.run();
}
