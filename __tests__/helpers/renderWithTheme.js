import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../contexts';

export function renderWithTheme(ui, options) {
  return render(
    <ThemeProvider>{ui}</ThemeProvider>,
    options
  );
}
