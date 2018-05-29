extern crate actix;
extern crate actix_web;
extern crate dotenv;
extern crate env_logger;

#[macro_use]
extern crate log;

use actix_web::http::{Method, StatusCode};
use actix_web::{App, fs, HttpRequest, HttpResponse, middleware, pred, Result, server};
use dotenv::dotenv;

fn analytics_handling(_req: HttpRequest) -> Result<fs::NamedFile> {
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
    Ok(fs::NamedFile::open("static/fixed_api_not_found.json")?.set_status_code(StatusCode::NOT_FOUND))
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
    ]).bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .start();

    info!("Started HTTP server: 127.0.0.1:9292");

    let _ = sys.run();
}
