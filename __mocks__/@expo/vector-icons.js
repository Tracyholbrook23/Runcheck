const React = require('react');
const { Text } = require('react-native');

function MockIcon(props) {
  return React.createElement(Text, { testID: `icon-${props.name}` }, props.name);
}

module.exports = {
  Ionicons: MockIcon,
  MaterialIcons: MockIcon,
  FontAwesome: MockIcon,
};
