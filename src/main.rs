extern crate actix_web;
extern crate dotenv;
extern crate env_logger;

#[macro_use]
extern crate log;

use actix_web::{server, App, HttpRequest};
use dotenv::dotenv;

fn index(req: HttpRequest) -> &'static str {
    "TODO: Serve file"
}

fn main() {
    dotenv().ok();
    env_logger::init();

    info!("Binding to: 127.0.0.1:9292");

    server::new(
        || App::new()
            .resource("/", |r| r.f(index)))
        .bind("127.0.0.1:9292")
        .expect("Unable to bind to 127.0.0.1:9292")
        .run();
}
