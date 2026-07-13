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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      absence_lessons: {
        Row: {
          ability_group: string | null
          absence_request_id: string
          class_name: string | null
          created_at: string
          grade_level: string | null
          id: string
          lesson_number: number
          subject: string | null
          substitute_teacher_id: string | null
        }
        Insert: {
          ability_group?: string | null
          absence_request_id: string
          class_name?: string | null
          created_at?: string
          grade_level?: string | null
          id?: string
          lesson_number: number
          subject?: string | null
          substitute_teacher_id?: string | null
        }
        Update: {
          ability_group?: string | null
          absence_request_id?: string
          class_name?: string | null
          created_at?: string
          grade_level?: string | null
          id?: string
          lesson_number?: number
          subject?: string | null
          substitute_teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "absence_lessons_absence_request_id_fkey"
            columns: ["absence_request_id"]
            isOneToOne: false
            referencedRelation: "absence_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_lessons_substitute_teacher_id_fkey"
            columns: ["substitute_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      absence_requests: {
        Row: {
          absence_date: string
          admin_note: string | null
          created_at: string
          decided_at: string | null
          id: string
          status: Database["public"]["Enums"]["absence_status"]
          teacher_id: string
          updated_at: string
        }
        Insert: {
          absence_date: string
          admin_note?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["absence_status"]
          teacher_id: string
          updated_at?: string
        }
        Update: {
          absence_date?: string
          admin_note?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["absence_status"]
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_requests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_slots: {
        Row: {
          ability_group: string | null
          class_name: string | null
          created_at: string
          day: number
          grade_level: string | null
          id: string
          lesson_number: number
          status: Database["public"]["Enums"]["slot_status"]
          subject: string | null
          teacher_id: string
          updated_at: string
        }
        Insert: {
          ability_group?: string | null
          class_name?: string | null
          created_at?: string
          day: number
          grade_level?: string | null
          id?: string
          lesson_number: number
          status: Database["public"]["Enums"]["slot_status"]
          subject?: string | null
          teacher_id: string
          updated_at?: string
        }
        Update: {
          ability_group?: string | null
          class_name?: string | null
          created_at?: string
          day?: number
          grade_level?: string | null
          id?: string
          lesson_number?: number
          status?: Database["public"]["Enums"]["slot_status"]
          subject?: string | null
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      substitute_assignments: {
        Row: {
          absence_lesson_id: string
          assignment_date: string
          created_at: string
          id: string
          lesson_number: number
          substitute_teacher_id: string
        }
        Insert: {
          absence_lesson_id: string
          assignment_date: string
          created_at?: string
          id?: string
          lesson_number: number
          substitute_teacher_id: string
        }
        Update: {
          absence_lesson_id?: string
          assignment_date?: string
          created_at?: string
          id?: string
          lesson_number?: number
          substitute_teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "substitute_assignments_absence_lesson_id_fkey"
            columns: ["absence_lesson_id"]
            isOneToOne: false
            referencedRelation: "absence_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "substitute_assignments_substitute_teacher_id_fkey"
            columns: ["substitute_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          schedule_locked: boolean
          type: Database["public"]["Enums"]["teacher_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          schedule_locked?: boolean
          type?: Database["public"]["Enums"]["teacher_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          schedule_locked?: boolean
          type?: Database["public"]["Enums"]["teacher_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      absence_status: "pending" | "approved" | "rejected"
      app_role: "admin" | "teacher"
      slot_status: "teaching" | "free" | "available" | "unavailable"
      teacher_type: "regular" | "external"
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
    Enums: {
      absence_status: ["pending", "approved", "rejected"],
      app_role: ["admin", "teacher"],
      slot_status: ["teaching", "free", "available", "unavailable"],
      teacher_type: ["regular", "external"],
    },
  },
} as const
