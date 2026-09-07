/*
 * This file is part of the LGS1920/encoder project.
 *
 * File: ui-assets.ts
 *
 * Author : LGS1920 Team
 * email: studio@lgs1920.fr
 *
 * Created on: 2026-09-07
 * Last modified: 2026-09-07
 *
 * Copyright © 2026 LGS1920
 */

import css from '../public/assets/main.css' with {type: 'text'}
import html from '../public/index.html' with {type: 'text'}
import js from '../public/assets/main.js' with {type: 'text'}
import logoPngPath from '../public/assets/logo/lgs1920-mark.png' with {type: 'file'}
import studioLogoPngPath from '../public/assets/logo/lgs1920-studio.png' with {type: 'file'}
import testVideoPath from '../samples/lgs1920-encoder-test.webm' with {type: 'file'}
import logoSvg from '../public/assets/logo/lgs1920-encoder-icon.svg' with {type: 'text'}
import swaggerBundle from '../node_modules/swagger-ui-dist/swagger-ui-bundle.js' with {type: 'text'}
import swaggerCss from '../node_modules/swagger-ui-dist/swagger-ui.css' with {type: 'text'}

export type UiAssets = {
    html: string
    js: string
    css: string
    logoSvg?: string
    logoPngPath?: string
    studioLogoPngPath?: string
    testVideoPath?: string
    swaggerBundle: string
    swaggerCss: string
}

export const uiAssets: UiAssets = {
    html: html as unknown as string,
    js,
    css,
    logoSvg,
    logoPngPath,
    studioLogoPngPath,
    testVideoPath,
    swaggerBundle,
    swaggerCss,
}
