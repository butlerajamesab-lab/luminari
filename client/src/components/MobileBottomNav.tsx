import { useLocation } from "wouter";
import { useCase } from "@/contexts/CaseContext";
import { useAuth } from "@/core/hooks/useAuth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MoreHorizontal,
  Scale,
  LogOut,
  ChevronRight,
  Heart,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  accountItems,
  caseWorkspaceItems,
  getNavSectionsForLens,
  isUserLens,
  LENS_OPTIONS,
  mobilePrimaryItems,
  type NavItem,
  type UserLens,
} from "./navigation";

const LENS_KEY = "luminari-user-lens";

function MobileMenuItems({
  items,
  sectionId,
  location,
  onNavigate,
}: {
  items: NavItem[];
  sectionId: string;
  location: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const isActive = location === item.path || location.startsWith(`${item.path}/`);
        return (
          <button
            key={`${sectionId}:${item.path}`}
            onClick={() => onNavigate(item.path)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-left ${
              isActive
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-accent active:bg-accent"
            }`}
          >
            <item.icon
              className={`h-4 w-4 shrink-0 ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            />
            <span className="text-sm flex-1">{item.label}</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          </button>
        );
      })}
    </div>
  );
}

export default function MobileBottomNav() {
  const [location, setLocation] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const { currentCase } = useCase();
  const { user, logout } = useAuth();
  const [activeLens, setActiveLens] = useState<UserLens>(() => {
    try {
      const saved = localStorage.getItem(LENS_KEY);
      if (isUserLens(saved)) return saved;
    } catch {}
    return "professional";
  });

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LENS_KEY && isUserLens(event.newValue)) {
        setActiveLens(event.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const visibleSections = useMemo(
    () => getNavSectionsForLens(activeLens, user?.role === "admin"),
    [activeLens, user?.role],
  );

  const handleLensChange = (lens: UserLens) => {
    setActiveLens(lens);
    try {
      localStorage.setItem(LENS_KEY, lens);
    } catch {}
    window.dispatchEvent(new StorageEvent("storage", { key: LENS_KEY, newValue: lens }));
  };

  const handleNavigate = (path: string) => {
    setLocation(path);
    setMoreOpen(false);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border safe-area-bottom">
        <div className="flex items-stretch justify-around h-14">
          {mobilePrimaryItems.map((tab) => {
            const isActive = location === tab.path;
            return (
              <button
                key={tab.path}
                onClick={() => handleNavigate(tab.path)}
                className={`flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors relative ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                }`}
              >
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
                <tab.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center flex-1 gap-0.5 transition-colors ${
              moreOpen
                ? "text-primary"
                : "text-muted-foreground active:text-foreground"
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] rounded-t-xl pb-safe">
          <SheetHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              <SheetTitle className="text-sm">
                Luminari
                <span className="text-[10px] font-mono text-muted-foreground ml-2 bg-muted px-1.5 py-0.5 rounded">
                  v4.0
                </span>
              </SheetTitle>
            </div>
            {currentCase && (
              <p className="text-xs text-muted-foreground">
                {currentCase.name}
              </p>
            )}
          </SheetHeader>

          <div className="overflow-y-auto flex-1 -mx-4 px-4">
            <div className="mb-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                Case Workspace
              </p>
              <MobileMenuItems
                items={caseWorkspaceItems}
                sectionId="case_workspace"
                location={location}
                onNavigate={handleNavigate}
              />
            </div>

            {visibleSections.map((section) => (
              <div key={section.id} className="mb-4">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                  {section.label}
                </p>
                <MobileMenuItems
                  items={section.items}
                  sectionId={section.id}
                  location={location}
                  onNavigate={handleNavigate}
                />
              </div>
            ))}

            <div className="mb-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                Account
              </p>
              <MobileMenuItems
                items={accountItems}
                sectionId="account"
                location={location}
                onNavigate={handleNavigate}
              />
            </div>

            <div className="mb-4">
              <button
                onClick={() => {
                  setMoreOpen(false);
                  window.location.href = "/welcome";
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left bg-primary/10 border border-primary/20 hover:bg-primary/15"
              >
                <Heart className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-primary">Guided View</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Step-by-step help for your situation
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-primary/50" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                View Mode
              </p>
              <div className="flex gap-1.5 px-1">
                {LENS_OPTIONS.map((lens) => (
                  <button
                    key={lens}
                    onClick={() => handleLensChange(lens)}
                    className={`flex-1 text-xs py-2 rounded-md transition-colors font-medium ${
                      activeLens === lens
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {lens.charAt(0).toUpperCase() + lens.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {user && (
              <div className="border-t border-border pt-3 mt-2 mb-2">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-primary">
                      {user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-destructive hover:bg-destructive/10 active:bg-destructive/10 transition-colors text-left mt-1"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span className="text-sm">Sign out</span>
                </button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
