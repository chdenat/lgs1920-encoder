/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: version.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import packageJson from '../package.json' with {type: 'json'}

/** The application version published with the current source tree. */
export const APP_VERSION = packageJson.version
