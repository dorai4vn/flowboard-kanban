
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agent_approvals": {
                  Row: {
                    "action": string,"claim_token": string | null,"created_at": string,"decided_at": string | null,"detail": NonNullable<Json>,"expires_at": string,"id": string,"run_state": string,"run_state_mac": string,"status": string,"target_id": string,"target_label": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"claim_token"?: string | null,"created_at"?: string,"decided_at"?: string | null,"detail"?: NonNullable<Json>,"expires_at": string,"id"?: string,"run_state": string,"run_state_mac": string,"status"?: string,"target_id": string,"target_label": string,"user_id": string
                  }
                  Update: {
                    "action"?: string,"claim_token"?: string | null,"created_at"?: string,"decided_at"?: string | null,"detail"?: NonNullable<Json>,"expires_at"?: string,"id"?: string,"run_state"?: string,"run_state_mac"?: string,"status"?: string,"target_id"?: string,"target_label"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"agent_requests": {
                  Row: {
                    "created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"boards": {
                  Row: {
                    "accent": string,"created_at": string,"id": string,"name": string,"position": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accent"?: string,"created_at"?: string,"id": string,"name": string,"position"?: number,"user_id"?: string
                  }
                  Update: {
                    "accent"?: string,"created_at"?: string,"id"?: string,"name"?: string,"position"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"labels": {
                  Row: {
                    "board_id": string,"color": string,"created_at": string,"id": string,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "board_id": string,"color": string,"created_at"?: string,"id": string,"name": string,"user_id"?: string
                  }
                  Update: {
                    "board_id"?: string,"color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "labels_board_id_user_id_fkey"
      columns: ["board_id","user_id"]
isOneToOne: false
      referencedRelation: "boards"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"task_labels": {
                  Row: {
                    "label_id": string,"task_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "label_id": string,"task_id": string,"user_id"?: string
                  }
                  Update: {
                    "label_id"?: string,"task_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_labels_label_id_user_id_fkey"
      columns: ["label_id","user_id"]
isOneToOne: false
      referencedRelation: "labels"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "task_labels_task_id_user_id_fkey"
      columns: ["task_id","user_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "board_id": string,"completed_at": string | null,"created_at": string,"description": string,"due_date": string | null,"id": string,"position": number,"priority": string,"status": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "board_id": string,"completed_at"?: string | null,"created_at"?: string,"description"?: string,"due_date"?: string | null,"id": string,"position"?: number,"priority"?: string,"status"?: string,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "board_id"?: string,"completed_at"?: string | null,"created_at"?: string,"description"?: string,"due_date"?: string | null,"id"?: string,"position"?: number,"priority"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_board_id_user_id_fkey"
      columns: ["board_id","user_id"]
isOneToOne: false
      referencedRelation: "boards"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "agent_claim_approval":
{ Args: { "p_action": string,"p_id": string,"p_target": string }; Returns: Json
                           },
"agent_consume_claim":
{ Args: { "p_action": string,"p_claim": string,"p_id": string,"p_target": string }; Returns: Json
                           },
"agent_create_approval":
{ Args: { "p_action": string,"p_run_state": string,"p_run_state_mac": string,"p_target": string,"p_ttl_seconds"?: number }; Returns: Json
                           },
"agent_execute_approval":
{ Args: { "p_action": string,"p_claim": string,"p_id": string,"p_target": string }; Returns: Json
                           },
"agent_reject_approval":
{ Args: { "p_action": string,"p_id": string,"p_target": string }; Returns: Json
                           },
"create_board":
{ Args: { "p_board": Json,"p_labels": Json,"p_only_if_empty"?: boolean,"p_tasks": Json }; Returns: boolean
                           },
"move_task":
{ Args: { "p_completed_at": string,"p_ordered_ids": (string)[],"p_status": string,"p_task_id": string }; Returns: undefined
                           },
"save_task":
{ Args: { "p_label_ids": (string)[],"p_must_exist"?: boolean,"p_task": Json }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
