import { describe, expect, it } from 'vitest';
import { linuxAutostartEnabled, linuxAutostartPath, renderLinuxAutostart } from '../src/core/linux-autostart';

describe('linux autostart file', () => {
  it('quotes the launch command and enables the login item', () => {
    const file = renderLinuxAutostart(['/usr/bin/desk', '--started-by-desk-autostart']);
    expect(file).toContain('Exec="/usr/bin/desk" "--started-by-desk-autostart"');
    expect(file).toContain('X-GNOME-Autostart-enabled=true');
    expect(linuxAutostartEnabled(file)).toBe(true);
    expect(linuxAutostartPath('/home/person/.config')).toBe(
      '/home/person/.config/autostart/dev.desk.companion.desktop',
    );
  });
});
