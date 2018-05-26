extern crate actix;
extern crate actix_web;
extern crate dotenv;
extern crate env_logger;

#[macro_use]
extern crate log;

use actix_web::http::{Method, StatusCode};
use actix_web::{App, fs, HttpRequest, HttpResponse, middleware, pred, Result, server};
use dotenv::dotenv;

fn favicon(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/favicon.ico")?)
}

fn not_found(_req: HttpRequest) -> Result<fs::NamedFile> {
    Ok(fs::NamedFile::open("static/404.html")?.set_status_code(StatusCode::NOT_FOUND))
}

fn main() {
    dotenv().ok();
    env_logger::init();

    let sys = actix::System::new("scout");

    server::new(move || vec![
        App::new()
            .prefix("/api/v1")
            .middleware(middleware::Logger::default())
            .resource("/", |r| r.f(|_r| HttpResponse::Ok())),
        // No logger for the static routes for now...
        App::new()
            .middleware(middleware::Logger::default())
            .resource("/favicon.ico", |r| r.method(Method::GET).f(favicon))
            .default_resource( |r| {
                r.method(Method::GET).f(not_found);
                r.route().filter(pred::Not(pred::Get())).f( |_req| HttpResponse::MethodNotAllowed());
            }),
    ]).bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .start();

    info!("Started HTTP server: 127.0.0.1:9292");

    let _ = sys.run();
}
