import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LogOut, Upload } from 'lucide-react';
import { useState } from 'react';
import { CsvImportDialog } from '@/components/transacoes/CsvImportDialog';

export function AppHeader() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);

  const handleLogout = () => {
    signOut();
    navigate('/login');
  };

  return (
    <>
      <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
        <div className="flex items-center gap-2">
          <SidebarTrigger />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
