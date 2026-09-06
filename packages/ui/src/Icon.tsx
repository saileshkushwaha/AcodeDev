import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Bot,
  Braces,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleDot,
  Circle,
  Clock,
  Code,
  Columns,
  Copy,
  Database,
  Download,
  Edit,
  ExternalLink,
  FilePlus,
  FileCode,
  FileText,
  FlaskConical,
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Inbox,
  Image,
  Key,
  Layers,
  LayoutGrid,
  Link,
  Loader,
  Loader2,
  Lock,
  Mail,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquare,
  Minimize2,
  Moon,
  PanelsLeftRight,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Rocket,
  RotateCcw,
  Save,
  ScrollText,
  Search,
  Send,
  Settings,
  Shapes,
  Shield,
  Sparkles,
  SquarePen,
  Star,
  Target,
  Trash2,
  Upload,
  Workflow,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Semantic icon registry — the single source of truth for icon names used
 * across the app. Maps a friendly key to a lucide-react icon component so
 * the whole UI stays consistent (same stroke width, size and style).
 */
export const ICONS = {
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowUp: ArrowUp,
  bell: Bell,
  bot: Bot,
  braces: Braces,
  briefcase: Briefcase,
  check: Check,
  checkCircle: CheckCircle2,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  circleAlert: CircleAlert,
  circle: Circle,
  circleDot: CircleDot,
  clock: Clock,
  code: Code,
  columns: Columns,
  copy: Copy,
  database: Database,
  download: Download,
  edit: Edit,
  expand: Maximize2,
  externalLink: ExternalLink,
  filePlus: FilePlus,
  fileCode: FileCode,
  fileText: FileText,
  flask: FlaskConical,
  folder: Folder,
  folderOpen: FolderOpen,
  gauge: Gauge,
  gitBranch: GitBranch,
  gitMerge: GitMerge,
  gitPullRequest: GitPullRequest,
  gitPullRequestClosed: GitPullRequestClosed,
  gitPullRequestDraft: GitPullRequestDraft,
  inbox: Inbox,
  image: Image,
  key: Key,
  layers: Layers,
  layoutGrid: LayoutGrid,
  link: Link,
  loader: Loader,
  loader2: Loader2,
  lock: Lock,
  mail: Mail,
  collapse: Minimize2,
  menu: Menu,
  message: MessageCircle,
  messageSquare: MessageSquare,
  moon: Moon,
  panels: PanelsLeftRight,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  repeat: Repeat,
  rocket: Rocket,
  rotateCcw: RotateCcw,
  save: Save,
  scrollText: ScrollText,
  search: Search,
  send: Send,
  settings: Settings,
  shapes: Shapes,
  shield: Shield,
  sparkles: Sparkles,
  squarePen: SquarePen,
  star: Star,
  target: Target,
  trash: Trash2,
  upload: Upload,
  workflow: Workflow,
  wrench: Wrench,
  x: X,
  zap: Zap,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/**
 * Standardized icon component. Usage:
 *   <Icon name="copy" size={16} />
 * Always renders a lucide stroke icon inheriting `currentColor`, so it
 * follows the surrounding text/card color everywhere.
 */
export function Icon({
  name,
  size = 16,
  color,
  strokeWidth = 1.8,
  style,
  className,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const Cmp = ICONS[name];
  return <Cmp size={size} color={color ?? 'currentColor'} strokeWidth={strokeWidth} style={style} className={className} />;
}

/**
 * GitHub octocat brand mark. Not part of lucide, so it lives here as a
 * dedicated brand icon (stroke-free, fill-based) for consistent use.
 */
export function GithubIcon({
  size = 16,
  color = 'currentColor',
  style,
  className,
}: {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={style} className={className} aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2.13c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 015.79 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.12 3.05.73.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.14v3.18c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
