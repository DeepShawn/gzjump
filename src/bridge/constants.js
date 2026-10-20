// Shared tuning values for Fruit Bridge. World units are pixels at scale 1.
export const TAU = Math.PI * 2;

export const STORAGE_KEY = 'fruit_bridge_v1';
// Shared with Fruit Hop and the cloud scripts.
export const HOP_STORAGE_KEY = 'fruit_hop_v1';
export const AUTH_SESSION_KEY = 'gzjump_auth_session_v1';
export const PLAYER_NAME_KEY = 'gzjump_player_name';
export const DEVICE_ID_KEY = 'gzjump_device_id';

export const MODES = ['endless', 'daily', 'hell', 'myth'];
export const MODE_NAMES = {endless: '无尽', daily: '每日', hell: '地狱', myth: '神话'};
export const DEFAULT_SETTINGS = {sound: true, haptic: true, guides: true, beta: false, time: 'day'};
export const BOOLEAN_SETTINGS = ['sound', 'haptic', 'guides', 'beta'];

// Board and animation timings, in seconds.
export const BOARD_START = 22;
export const BOARD_GROWTH = 205; // px per second while held
export const DROP_TIME = .58;
export const WALK_TIME = .82;
export const FALL_TIME = .86;
export const LANDING_MARGIN = 8; // board end must land this far inside the target
export const PLAYER_START_X = 42;
export const FIRST_PLATFORM_WIDTH = 190;
export const PLATFORMS_AHEAD = 7;

export const PLATFORM_COLORS = ['#f8f5df', '#deebc5', '#f0ddcf', '#dfe7ee', '#d2e7d9'];

export const FRUIT_COLORS = {
  orange: ['#ffe0a0', '#f5a146', '#d77732'],
  lime: ['#e5ef9e', '#a8ca63', '#719f4d'],
  peach: ['#ffe0ca', '#f2a69b', '#ce7484'],
  lemon: ['#fff1a4', '#e8c94f', '#c99536'],
  blueberry: ['#d0d4f1', '#909ed2', '#6474a8'],
  melon: ['#c8e6a2', '#82bc7b', '#4e9365']
};

export const THEMES = {
  dawn: {label: '清晨', sky: ['#f8dfc8', '#d9eee0', '#a9d7d0'], cloud: '#f6cda966', water: '#83b8ad55', waterDeep: '#3c858b', horizon: '#9cc7b7', mountain: '#79aa9a', road: '#d7c1a1', accent: '#c77d5b'},
  day: {label: '白天', sky: ['#dff0dd', '#c5e7dc', '#9bd4d0'], cloud: '#a4d2bf55', water: '#7db7ac30', waterDeep: '#287b83', horizon: '#83b9a4', mountain: '#5b9a88', road: '#d6d9c2', accent: '#4a8b68'},
  dusk: {label: '黄昏', sky: ['#f5d4bd', '#edc6b5', '#aabbd0'], cloud: '#e8a88c66', water: '#758ead55', waterDeep: '#365e78', horizon: '#b28d9c', mountain: '#786a88', road: '#d7b49c', accent: '#b16b5b'},
  night: {label: '夜晚', sky: ['#1d3550', '#244963', '#387b83'], cloud: '#87bfd033', water: '#9bd9da26', waterDeep: '#123c5a', horizon: '#315d73', mountain: '#244e66', road: '#9db9bb', accent: '#7ec8be'}
};
