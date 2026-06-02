import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { FloatingActionButton } from '@/components/layout/FloatingActionButton';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }

    const checkOnboarding = async () => {
      const { data } = await supabase
        .from('contas')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);
      
      if (!data || data.length === 0) {
        navigate('/onboarding');
      }
      setCheckingOnboarding(false);
    };

    checkOnboarding();
  }, [user, authLoading, navigate]);

  if (authLoading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {/* ErrorBoundary com key={pathname} reseta o erro a cada
                troca de rota. key também dispara a animação page-enter
                ao mudar de rota (React re-cria o nó). */}
            <ErrorBoundary key={location.pathname}>
              <div className="page-enter">
                <Outlet />
              </div>
            </ErrorBoundary>
          </main>
        </div>
        <FloatingActionButton />
      </div>
    </SidebarProvider>
  );
}
