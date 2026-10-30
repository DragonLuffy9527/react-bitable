import React from 'react';
import { ICONS, type BitableIconName } from './icons';

export interface BitableIconProps extends React.SVGProps<SVGSVGElement> {
  /** 图标名称，例如 'table_chart', 'filter_alt', 'edit', 'add' */
  name: BitableIconName | string;
  /** 附加 className，可配合 Tailwind 控制尺寸与颜色（如 text-sm, text-rose-500） */
  className?: string;
  /** 显式指定像素尺寸，不传时默认 1em 继承当前文字字号 */
  size?: number | string;
  /** 鼠标悬停提示 */
  title?: string;
}

/**
 * 离线/内置矢量图标组件。
 *
 * 采用 24x24 viewBox，默认 `width="1em" height="1em" fill="currentColor"`，
 * 自动继承父级 font-size 与 text 颜色。无需加载任何 Google Fonts，
 * 彻底杜绝内网/离线环境下的图标丢失与首屏排版闪烁（FOIT）。
 */
export const BitableIcon: React.FC<BitableIconProps> = ({
  name,
  className = '',
  size,
  style,
  title,
  ...rest
}) => {
  const iconContent = ICONS[name];

  const customStyle: React.CSSProperties = {
    ...style,
    ...(size ? { width: size, height: size } : {})
  };

  const titleNode = title ? <title>{title}</title> : null;

  if (!iconContent) {
    // 兜底：如果传入未知图标名，渲染一个优雅的缺省标记，不报错
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`inline-block shrink-0 align-middle ${className}`}
        style={customStyle}
        width={size ?? '1em'}
        height={size ?? '1em'}
        aria-hidden={title ? undefined : 'true'}
        data-bitable-icon={name}
        {...rest}
      >
        {titleNode}
        <circle cx="12" cy="12" r="4" opacity="0.4" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`inline-block shrink-0 align-middle ${className}`}
      style={customStyle}
      width={size ?? '1em'}
      height={size ?? '1em'}
      aria-hidden={title ? undefined : 'true'}
      data-bitable-icon={name}
      {...rest}
    >
      {titleNode}
      {iconContent}
    </svg>
  );
};
