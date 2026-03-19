import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCategorias, type Categoria } from '@/hooks/useCategorias';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function CategoriasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { parents, children, isLoading, seedCategorias } = useCategorias();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState('#9ca3af');
  const [parentId, setParentId] = useState<string | null>(null);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openCreate = (parent_id: string | null = null) => {
    setEditingCat(null);
    setNome('');
    setCor('#9ca3af');
    setParentId(parent_id);
    setDialogOpen(true);
  };

  const openEdit = (cat: Categoria) => {
    setEditingCat(cat);
    setNome(cat.nome);
    setCor(cat.cor || '#9ca3af');
    setParentId(cat.parent_id);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (editingCat) {
        const { error } = await supabase.from('categorias').update({ nome, cor }).eq('id', editingCat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categorias').insert({
          user_id: user.id,
          nome,
          cor: parentId ? null : cor,
          parent_id: parentId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setDialogOpen(false);
      toast({ title: editingCat ? 'Categoria atualizada' : 'Categoria criada' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categorias').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      toast({ title: 'Categoria excluída' });
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Carregando categorias...</div>;
  }

  if (parents.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Categorias</h1>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma categoria encontrada.</p>
            <Button onClick={() => seedCategorias.mutate()} disabled={seedCategorias.isPending}>
              {seedCategorias.isPending ? 'Criando...' : 'Criar Categorias Padrão'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categorias</h1>
        <Button onClick={() => openCreate()}>
          <Plus className="h-4 w-4 mr-1" /> Nova Categoria
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {parents.map(parent => {
              const subs = children(parent.id);
              const isExpanded = expandedParents.has(parent.id);

              return (
                <Collapsible key={parent.id} open={isExpanded} onOpenChange={() => toggleExpand(parent.id)}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                    {subs.length > 0 ? (
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                    ) : (
                      <div className="w-6" />
                    )}
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: parent.cor || '#9ca3af' }} />
                    <span className="font-medium flex-1">{parent.nome}</span>
                    <span className="text-xs text-muted-foreground mr-2">
                      {subs.length > 0 && `${subs.length} sub`}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCreate(parent.id)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(parent)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(parent.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {subs.length > 0 && (
                    <CollapsibleContent>
                      <div className="border-l-2 ml-7 border-muted">
                        {subs.map(sub => (
                          <div key={sub.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/30 transition-colors">
                            <span className="text-xs text-muted-foreground">↳</span>
                            <span className="flex-1 text-sm">{sub.nome}</span>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sub)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(sub.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? 'Editar Categoria' : parentId ? 'Nova Subcategoria' : 'Nova Categoria'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (nome.trim()) saveMutation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da categoria" />
            </div>
            {!parentId && (
              <div className="space-y-2">
                <Label>Cor</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={cor} onChange={e => setCor(e.target.value)} className="h-10 w-10 rounded cursor-pointer" />
                  <Input value={cor} onChange={e => setCor(e.target.value)} className="flex-1" />
                </div>
              </div>
            )}
            <Button className="w-full" type="submit" disabled={!nome.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
