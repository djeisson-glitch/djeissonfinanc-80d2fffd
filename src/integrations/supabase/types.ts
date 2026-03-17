export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      configuracoes: {
        Row: {
          created_at: string
          id: string
          receita_mensal_fixa: number
          reserva_minima: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          receita_mensal_fixa?: number
          reserva_minima?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          receita_mensal_fixa?: number
          reserva_minima?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contas: {
        Row: {
          created_at: string
          id: string
          nome: string
          saldo_inicial: number
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          saldo_inicial?: number
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          tipo?: string
          user_id?: string
        }
        Relationships: []
      }
      historico_importacoes: {
        Row: {
          conta_id: string
          conta_nome: string
          created_at: string
          id: string
          nome_arquivo: string
          qtd_duplicadas: number
          qtd_importada: number
          qtd_total: number
          tipo_arquivo: string
          user_id: string
        }
        Insert: {
          conta_id: string
          conta_nome: string
          created_at?: string
          id?: string
          nome_arquivo: string
          qtd_duplicadas?: number
          qtd_importada?: number
          qtd_total?: number
          tipo_arquivo?: string
          user_id: string
        }
        Update: {
          conta_id?: string
          conta_nome?: string
          created_at?: string
          id?: string
          nome_arquivo?: string
          qtd_duplicadas?: number
          qtd_importada?: number
          qtd_total?: number
          tipo_arquivo?: string
          user_id?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          arquivo: string
          created_at: string
          data_importacao: string
          detalhes_json: Json
          id: string
          linhas_importadas: number
          linhas_rejeitadas: number
          total_linhas_csv: number
          user_id: string
        }
        Insert: {
          arquivo: string
          created_at?: string
          data_importacao?: string
          detalhes_json?: Json
          id?: string
          linhas_importadas?: number
          linhas_rejeitadas?: number
          total_linhas_csv?: number
          user_id: string
        }
        Update: {
          arquivo?: string
          created_at?: string
          data_importacao?: string
          detalhes_json?: Json
          id?: string
          linhas_importadas?: number
          linhas_rejeitadas?: number
          total_linhas_csv?: number
          user_id?: string
        }
        Relationships: []
      }
      regras_categorizacao: {
        Row: {
          aprendido_auto: boolean
          categoria: string
          created_at: string
          essencial: boolean
          id: string
          padrao: string
          user_id: string
        }
        Insert: {
          aprendido_auto?: boolean
          categoria: string
          created_at?: string
          essencial?: boolean
          id?: string
          padrao: string
          user_id: string
        }
        Update: {
          aprendido_auto?: boolean
          categoria?: string
          created_at?: string
          essencial?: boolean
          id?: string
          padrao?: string
          user_id?: string
        }
        Relationships: []
      }
      transacoes: {
        Row: {
          categoria: string
          conta_id: string
          created_at: string
          data: string
          descricao: string
          essencial: boolean
          grupo_parcela: string | null
          hash_transacao: string
          id: string
          observacoes: string | null
          parcela_atual: number | null
          parcela_total: number | null
          pessoa: string
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria?: string
          conta_id: string
          created_at?: string
          data: string
          descricao: string
          essencial?: boolean
          grupo_parcela?: string | null
          hash_transacao: string
          id?: string
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          pessoa?: string
          tipo: string
          user_id: string
          valor: number
        }
        Update: {
          categoria?: string
          conta_id?: string
          created_at?: string
          data?: string
          descricao?: string
          essencial?: boolean
          grupo_parcela?: string | null
          hash_transacao?: string
          id?: string
          observacoes?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          pessoa?: string
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "transacoes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
