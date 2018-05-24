# Scout Analytics

Scout is a website analytics server intended to provide the metrics needed by
website operators to improve and monitor the health and popularity of their
site, without compromising users privacy or security.

Be in control of the data footprint generated by your site.

## Why?

This project is both a personal adventure into the land of Rust as a webserver,
and a means to attempt to make exactly what I wanted out of website analytics.

I've used Google Analytics on my websites since 2007. It's been decent and
provided the metrics I've wanted to know for the most part, but I've always
been uneasy by the assistance I provide to Google in tracking users across the
web.

I've tried Piwik every couple of years, which seems to be the leading
self-hosted and open source analytics suite but I was unhappy with the
reduction in speed and metric quality of their server, and did not like having
to host PHP or MySQL on my infrastructure. Unhappy enough that I never fully
transferred away from Google Analytics and eventually dropped it altogether.

Without going on to much of a rant, I've also been suspicious of the reported
values in Google Analytics. It, however, is a black box and Google doesn't
provide meaningful support for non-paying users.

Ultimately neither Piwik or Google Analytics match what I was looking for in
analytics and clearly didn't share my values about user privacy as well.

The final couple of straws was me being forced to leave `unsafe-inline` in all
of my sites content security policy for Google Analytics to continue working
(I'm sure there is a workaround but frankly its not worth it), and Google
Analytics page speed metrics recommend I stop using their own javascript.
Alright Google I'll take your advice.

## Ideals

* Respect do not track
* Respect the privacy of individuals even if they haven't opted into do not
  track
* Secure the information that is collected to the best of my ability
* Automatically roll up and anonymize data for any metric that lasts longer
  than 7 days
* Do not interfere with the normal operations or speed of the website the
  analytics are installed on
* Do not significantly impact the data usage of any device, or the battery life
  of mobile devices.

There is a lot to write about the individual points here but the first two
desesrve some attention. I have my own view of what respecting do not track
means and I want to clarify those views. I have read and generally agree with
[EFF's Do Not Track Policy][1].

I also want to apply many of those policies to my users as much as I can. In
the spirit of them this software will:

* Only use regular cookies when tracking user sessions and returning users (no
  super cookies, local storage tricks, web workers, cache timing,
  fingerprinting, or anything in this spirit) to track any user.
* Never use any cookie for user's that have enabled the DNT flag
* Never attempt to associate any data collected to connect to a real world
  identity, other machines that may be controlled or near the browser running
  the agent, or with previously expired browser cookies (session cookies will
  be associated with browser cookies to identify a return visit vs a new user).
* IP addresses will be Geocoded to a country and then be immediately discarded
  by this server (I can not prevent web server and system logs from storing
  these IPs, that will be up to the site operator)
* This will not intentionally integrate with third party services at all. This
  won't prevent third parties from accessing the database on their own, or
  forking and modifying the code themselves but this code base will provide
  very little information for those who attempt these measures.

I believe that those guarantees will allows website operators to use this
software without violating any of EFFs terms. When this code base is in a more
complete and well rounded state, I intend to reach out to some of them to
review at least these guarantees and perhaps the code itself.

## Feedback

This software is still very young, but I'd love to hear feedback and questions
from anyone on the code, the ideals, or the goals of this software. You can
either email me (address available in every single commit), or by opening an
issue on this code base.

[1]: https://www.eff.org/dnt-policy
