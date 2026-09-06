import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useLiveSocket } from "@/hooks/use-live-socket";
import {
  Activity,
  Car,
  Cpu,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Signal,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { status: socketStatus } = useLiveSocket();
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar className="border-r border-border bg-card">
          <SidebarHeader className="border-b border-border p-4">
            <div className="flex items-center gap-2 font-mono text-xl font-bold tracking-tight text-primary">
              <Cpu className="h-6 w-6" />
              <span>RFID SCAN</span>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="px-2 py-4 gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/"}
                  tooltip="Dashboard"
                >
                  <Link href="/" data-testid="link-dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/logs"}
                  tooltip="Access Logs"
                >
                  <Link href="/logs" data-testid="link-logs">
                    <Activity className="h-4 w-4" />
                    <span>Access Logs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/devices"}
                  tooltip="Gate Devices"
                >
                  <Link href="/devices" data-testid="link-devices">
                    <Cpu className="h-4 w-4" />
                    <span>Gate Devices</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/vehicles"}
                  tooltip="Vehicles"
                >
                  <Link href="/vehicles" data-testid="link-vehicles">
                    <Car className="h-4 w-4" />
                    <span>Vehicles</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/rfid-cards"}
                  tooltip="RFID Cards"
                >
                  <Link href="/rfid-cards" data-testid="link-rfid">
                    <CreditCard className="h-4 w-4" />
                    <span>RFID Cards</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t border-border p-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                  {user?.email || "Operator"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  title="Logout"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 border-b border-border bg-card/50 flex items-center justify-between px-4 sticky top-0 z-10 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h1 className="text-sm font-mono text-muted-foreground uppercase tracking-widest hidden sm:block">
                {location === "/" ? "SYSTEM OVERVIEW" : location.replace("/", "").replace("-", " ")}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {socketStatus === "connected" && (
                <Badge variant="outline" className="border-success/50 text-success bg-success/10 font-mono gap-1.5" data-testid="status-socket">
                  <Signal className="h-3 w-3" />
                  LIVE
                </Badge>
              )}
              {socketStatus === "connecting" && (
                <Badge variant="outline" className="border-warning/50 text-warning bg-warning/10 font-mono gap-1.5" data-testid="status-socket">
                  <Signal className="h-3 w-3 animate-pulse" />
                  CONNECTING
                </Badge>
              )}
              {(socketStatus === "disconnected" || socketStatus === "reconnecting") && (
                <Badge variant="outline" className="border-destructive/50 text-destructive bg-destructive/10 font-mono gap-1.5" data-testid="status-socket">
                  <WifiOff className="h-3 w-3" />
                  OFFLINE
                </Badge>
              )}
            </div>
          </header>
          <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
