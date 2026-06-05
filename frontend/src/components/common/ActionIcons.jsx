const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

export function EyeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2.5 12s3.5-6 9.5-6s9.5 6 9.5 6s-3.5 6-9.5 6s-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

export function EyeOffIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 3l18 18" />
      <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a15.4 15.4 0 0 1-2.2 3.1" />
      <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
      <path d="M6.5 6.5C3.8 8.2 2.5 12 2.5 12s3.5 7 9.5 7c1.4 0 2.7-.3 3.8-.8" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 3v11" />
      <path d="m7.5 10.5l4.5 4.5l4.5-4.5" />
      <path d="M5 20h14" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M18 7l-1 17H7L6 7" />
      <path d="M10 11v8M14 11v8" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5l4 4" />
    </svg>
  );
}

export function ClipboardIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 4h6l1 2h3v18H5V6h3l1-2Z" />
      <path d="M9 11h6M9 15h6M9 19h4" />
    </svg>
  );
}

export function FolderIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 6h7l2 2h9v12H3z" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <svg {...iconProps}>
      <path d="M19 12H5" />
      <path d="m11 6l-6 6l6 6" />
    </svg>
  );
}
