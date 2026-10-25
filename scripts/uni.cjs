process.env.UNI_INPUT_DIR = require('path').resolve(__dirname, '..');
require('./prepare.cjs');
require('@dcloudio/vite-plugin-uni/bin/uni.js');
