import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Home, Table2, ArrowDownUp } from 'lucide-react';
import { ViabilidadeTab } from '@/components/calculadora/ViabilidadeTab';
import { AmortizacaoTab } from '@/components/calculadora/AmortizacaoTab';
import { SimuladorAmortizacaoTab } from '@/components/calculadora/SimuladorAmortizacaoTab';
import { SacParams } from '@/lib/sac-utils';

const DEFAULT_PARAMS: SacParams = {
  valorImovel: 385000,
  entrada: 120000,
  prazoMeses: 360,
  taxaAnualNominal: 11.19,
  trAnual: 0.50,
  itbiPercent: 2.0,
  escrituraPercent: 2.0,
  rendaBruta: 14000,
  dividasMensais: 1300,
  limiteComprometimento: 30,
  capitalDisponivel: 170000,
  reservaMeses: 7,
  aluguelAtual: 1550,
  condominioAtual: 120,
  saldoDevedorCarro: 33000,
};

export default function CalculadoraPage() {
  const [params, setParams] = useState<SacParams>(DEFAULT_PARAMS);

  const handleChange = (partial: Partial<SacParams>) => {
    setParams(prev => ({ ...prev, ...partial }));
  };

  return (
    <div className="space-y-4 animate-fade-in max-w-4xl mx-auto">
      <Tabs defaultValue="viabilidade" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="viabilidade" className="flex-1 gap-1.5">
            <Home className="h-4 w-4" />
            Viabilidade
          </TabsTrigger>
          <TabsTrigger value="amortizacao" className="flex-1 gap-1.5">
            <Table2 className="h-4 w-4" />
            Amortização
          </TabsTrigger>
          <TabsTrigger value="simulador" className="flex-1 gap-1.5">
            <ArrowDownUp className="h-4 w-4" />
            Simulador
          </TabsTrigger>
        </TabsList>

        <TabsContent value="viabilidade" className="mt-4">
          <ViabilidadeTab params={params} onChange={handleChange} />
        </TabsContent>

        <TabsContent value="amortizacao" className="mt-4">
          <AmortizacaoTab params={params} />
        </TabsContent>

        <TabsContent value="simulador" className="mt-4">
          <SimuladorAmortizacaoTab params={params} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
