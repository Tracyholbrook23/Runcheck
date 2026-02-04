const React = require('react');
const { Text } = require('react-native');

function MockIcon({ name }) {
  return React.createElement(Text, { testID: `icon-${name}` }, name);
}

module.exports = MockIcon;
module.exports.default = MockIcon;
