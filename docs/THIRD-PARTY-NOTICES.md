# Third-party notices

The standalone executable embeds browser assets and depends on open-source media and UI libraries. Their original license files remain available in the installed dependency tree and must be included in a redistributed source or binary release.

## Swagger UI distribution

The dashboard embeds `swagger-ui-dist` for the local `/swagger` page. Swagger UI is distributed under the Apache License 2.0. See `node_modules/swagger-ui-dist/LICENSE` and `node_modules/swagger-ui-dist/NOTICE` in a dependency installation.

## Web Awesome

The dashboard uses `@awesome.me/webawesome`. Its license and notices are provided by the installed package.

## Media stack

The encoder uses Mediabunny, Mediabunny Server, NodeAV, and their codec dependencies. Their license files and notices are provided by the installed packages. The application project is licensed under the GNU Affero General Public License version 3 or later; see [LICENSE.md](../LICENSE.md).

When publishing a packaged executable, preserve this notice and review the current license files of the exact dependency versions in `bun.lock`.
