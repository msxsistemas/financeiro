import {
  LayoutDashboard, Receipt, Banknote, Tv, FileBarChart, Calendar,
  MessageCircle, Users, Target, Handshake, AlertTriangle, Inbox,
  Package, Tag, TrendingDown, Settings, Trash2, Shield,
  Plus, Edit, Save, X, Check, Search, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, ArrowLeft, ArrowRight, Filter,
  Eye, EyeOff, Download, Upload, Copy, RefreshCw, Send,
  Phone, Mail, MapPin, CreditCard, DollarSign, Wallet,
  Info, CheckCircle, AlertCircle, XCircle, Clock, Sun, Moon,
  LogOut, Menu as MenuIcon, Bell, Home, ArrowUp, ArrowDown,
  Percent, Hash, FileText, BarChart3, PieChart, LineChart
} from 'lucide-react'

const ICONS = {
  // nav
  dashboard: LayoutDashboard, debts: Receipt, cash: Banknote,
  iptv: Tv, reports: FileBarChart, calendar: Calendar,
  whatsapp: MessageCircle, contacts: Users, goals: Target,
  loans: Handshake, delinquents: AlertTriangle, inbox: Inbox,
  products: Package, categories: Tag, expenses: TrendingDown,
  settings: Settings, trash: Trash2, shield: Shield,
  // ações
  add: Plus, edit: Edit, save: Save, close: X, check: Check,
  search: Search, filter: Filter, download: Download, upload: Upload,
  copy: Copy, refresh: RefreshCw, send: Send,
  // chevrons
  down: ChevronDown, up: ChevronUp, left: ChevronLeft, right: ChevronRight,
  'arrow-left': ArrowLeft, 'arrow-right': ArrowRight,
  'arrow-up': ArrowUp, 'arrow-down': ArrowDown,
  eye: Eye, 'eye-off': EyeOff,
  // contato
  phone: Phone, mail: Mail, map: MapPin,
  // finanças
  card: CreditCard, dollar: DollarSign, wallet: Wallet, percent: Percent,
  // feedback
  info: Info, success: CheckCircle, warning: AlertCircle, error: XCircle,
  clock: Clock,
  // sistema
  sun: Sun, moon: Moon, logout: LogOut, menu: MenuIcon, bell: Bell, home: Home,
  hash: Hash, file: FileText,
  'bar-chart': BarChart3, 'pie-chart': PieChart, 'line-chart': LineChart
}

export default function Icon({ name, size = 18, className = '', strokeWidth = 2, ...rest }) {
  const C = ICONS[name]
  if (!C) return null
  return <C size={size} strokeWidth={strokeWidth} className={className} {...rest} />
}
