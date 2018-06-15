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

#[derive(Debug, Serialize, Deserialize)]
struct AnalyticData {
    // This one is going to be tricky... I need to decode based on the 'type'
    // field (which will be AnalyticType) then decode into its final data type
    // based on that.
    #[serde(rename = "type")]
    analytic_type: AnalyticType,

    #[serde(rename = "ts")]
    timestamp: u64,

    // Type 0 - VIEW_START
    // browser_first_seen: u64,
    // session_first_seen: u64,
    // title: String,
    // url: String,

    // Type 1 - VIEW_END
    //
    // no additional fields, timestamp can be used to close the session

    // Type 2 - VIEW_PERFORMANCE
    // perf_entry: AnalyticPerfEntry,
}

#[derive(Debug, Serialize, Deserialize)]
struct AnalyticPerfEntry {
    entry_type: PerfEntryType,
    // This is going to need a lot more fleshing out...
}

#[derive(Debug, Serialize, Deserialize)]
struct AnalyticRequest {
    #[serde(rename = "bid")]
    browser_id: String,

    #[serde(rename = "sid")]
    session_id: String,

    #[serde(rename = "svc")]
    session_view_count: u64,

    #[serde(rename = "ts")]
    timestamp: u64,
    data: Vec<AnalyticData>,
}

#[derive(Debug, Serialize, Deserialize)]
enum AnalyticType {
    ViewStart = 0,
    ViewEnd = 1,
    ViewPerformance = 2,
}

#[derive(Debug, Serialize, Deserialize)]
enum PerfEntryType {
    // This doesn't work... Need to figure this out
    //Navigation = String::from("navigation"),
}

fn analytics_handling(req: HttpRequest) -> Result<fs::NamedFile> {
    println!("{:?}", req);
    Ok(fs::NamedFile::open("static/fixed_api_response.json")?)
}

fn favicon(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/favicon.ico")?)
}

fn index(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/index.html")?)
}

fn not_found(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/404.html")?.set_status_code(StatusCode::NOT_FOUND))
}

fn api_not_found(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/fixed_api_not_found.json")?
        .set_status_code(StatusCode::NOT_FOUND))
}

fn page_one(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/page1.html")?)
}

fn page_two(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/page2.html")?)
}

fn track_script(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/js/track.js")?)
}

fn main() {
    dotenv().ok();
    env_logger::init();

    let sys = actix::System::new("scout");

    server::new(move || vec![
        App::new()
            .prefix("/api/v1")
            .middleware(middleware::Logger::default())
            .resource("/analytics", |r| r.method(Method::POST).f(analytics_handling))
            .default_resource( |r| {
                r.method(Method::GET).f(api_not_found);
                r.route().filter(pred::Not(pred::Get())).f( |_req| HttpResponse::MethodNotAllowed());
            }),
        // No logger for the static routes for now...
        App::new()
            .middleware(middleware::Logger::default())
            .resource("/", |r| r.method(Method::GET).f(index))
            .resource("/favicon.ico", |r| r.method(Method::GET).f(favicon))
            .resource("/page1.html", |r| r.method(Method::GET).f(page_one))
            .resource("/page2.html", |r| r.method(Method::GET).f(page_two))
            .resource("/js/track.js", |r| r.method(Method::GET).f(track_script))
            .default_resource( |r| {
                r.method(Method::GET).f(not_found);
                r.route().filter(pred::Not(pred::Get())).f( |_req| HttpResponse::MethodNotAllowed() );
            }),
    ])
        .keep_alive(30)
        .bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .start();

    info!("Started HTTP server: 127.0.0.1:9292");

    let _ = sys.run();
}
