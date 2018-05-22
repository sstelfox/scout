extern crate dotenv;
extern crate env_logger;

#[macro_use]
extern crate log;

use dotenv::dotenv;

fn main() {
    dotenv().ok();
    env_logger::init();

    info!("starting up");
}
