import { describe, it, expect } from 'vitest';
import { ICONS } from './icons';

describe('BitableIcon & ICONS - 内置离线矢量图标集', () => {
  it('包含核心操作图标', () => {
    expect(ICONS.add).toBeDefined();
    expect(ICONS.edit).toBeDefined();
    expect(ICONS.delete).toBeDefined();
    expect(ICONS.close).toBeDefined();
    expect(ICONS.check).toBeDefined();
    expect(ICONS.search).toBeDefined();
  });

  it('包含 6 种视图类型对应图标', () => {
    expect(ICONS.table_chart).toBeDefined();
    expect(ICONS.view_kanban).toBeDefined();
    expect(ICONS.calendar_month).toBeDefined();
    expect(ICONS.waterfall_chart).toBeDefined();
    expect(ICONS.image).toBeDefined();
    expect(ICONS.description).toBeDefined();
  });

  it('包含 12 种字段类型对应图标', () => {
    expect(ICONS.short_text).toBeDefined();
    expect(ICONS.pin).toBeDefined();
    expect(ICONS.radio_button_checked).toBeDefined();
    expect(ICONS.checklist).toBeDefined();
    expect(ICONS.calendar_today).toBeDefined();
    expect(ICONS.attach_file).toBeDefined();
    expect(ICONS.check_box).toBeDefined();
    expect(ICONS.link).toBeDefined();
    expect(ICONS.person).toBeDefined();
    expect(ICONS.groups).toBeDefined();
    expect(ICONS.label).toBeDefined();
    expect(ICONS.dns).toBeDefined();
  });

  it('包含云同步与多表工作区图标', () => {
    expect(ICONS.cloud_done).toBeDefined();
    expect(ICONS.cloud_sync).toBeDefined();
    expect(ICONS.cloud_off).toBeDefined();
    expect(ICONS.space_dashboard).toBeDefined();
    expect(ICONS.inventory_2).toBeDefined();
    expect(ICONS.bug_report).toBeDefined();
  });

  it('全部路径均为有效的 ReactNode', () => {
    Object.keys(ICONS).forEach((key) => {
      expect(ICONS[key]).toBeTruthy();
    });
  });
});
