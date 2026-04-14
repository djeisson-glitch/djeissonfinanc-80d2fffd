import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/Login";
import OnboardingPage from "@/pages/Onboarding";
import DashboardPage from "@/pages/Dashboard";
import TransacoesPage from "@/pages/Transacoes";
import CalculadoraPage from "@/pages/Calculadora";
import ContasPage from "@/pages/Contas";
import ConfiguracoesPage from "@/pages/Configuracoes";
import CategoriasPage from "@/pages/Categorias";
import ProjecoesPage from "@/pages/Projecoes";
import PlanejamentoPage from "@/pages/Planejamento";
import AnalisesPage from "@/pages/Analises";
import DividasPage from "@/pages/Dividas";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/transacoes" element={<TransacoesPage />} />
              <Route path="/calculadora" element={<CalculadoraPage />} />
              <Route path="/contas" element={<ContasPage />} />
              <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              <Route path="/categorias" element={<CategoriasPage />} />
              <Route path="/projecoes" element={<ProjecoesPage />} />
              <Route path="/planejamento" element={<PlanejamentoPage />} />
              <Route path="/analises" element={<AnalisesPage />} />
              <Route path="/dividas" element={<DividasPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
