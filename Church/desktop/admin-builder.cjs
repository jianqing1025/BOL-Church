// electron-builder config for BOLCCOP Admin — the same Electron install as the
// Meeting Client, a different entry file, name, icon and version.
const ADMIN_VERSION = '1.0.0';

module.exports = {
  appId: 'org.bolccop.admin',
  productName: 'BOLCCOP Admin',
  extraMetadata: {
    name: 'bolccop-admin',
    version: ADMIN_VERSION,
    description: 'Bread of Life Church admin (Windows)',
    main: 'admin-main.cjs',
  },
  files: ['admin-main.cjs', 'admin-policy.cjs', 'build/admin-icon.png'],
  win: { target: 'nsis', icon: 'build/admin-icon.ico', signAndEditExecutable: true },
  compression: 'maximum',
  electronLanguages: ['zh-TW', 'zh-CN', 'en-US'],
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'BOLCCOP Admin',
    deleteAppDataOnUninstall: false,
    language: '1028',
    installerLanguages: ['zh_TW'],
    runAfterFinish: true,
    include: 'build/installer.nsh',
  },
};
