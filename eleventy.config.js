/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: eleventy.config.js
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import packageJson from './package.json' with {type: 'json'}

/** Configure Eleventy to render the local encoder dashboard. */
export default function configureEleventy(eleventyConfig) {
    eleventyConfig.addPassthroughCopy({
        'src/ui/assets': 'assets',
    })
    eleventyConfig.addGlobalData('appVersion', packageJson.version)

    return {
        dir: {
            input: 'src/ui',
            output: 'public',
            includes: '_includes',
        },
        templateFormats: ['liquid'],
        htmlTemplateEngine: 'liquid',
    }
}
