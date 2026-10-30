const base = require('./app.json');

module.exports = ({ config }) => {
  const relayUrl = process.env.EXPO_PUBLIC_RELAY_URL?.trim();
  return {
    ...base.expo,
    ...config,
    extra: {
      ...base.expo.extra,
      ...config.extra,
      ...(relayUrl ? { relayUrl: relayUrl.replace(/\/$/, '') } : {}),
    },
  };
};
