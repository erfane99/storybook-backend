export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      stories: {
        Row: {
          created_at: string
          id: string
          raw_text: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          raw_text: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          raw_text?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      story_scenes: {
        Row: {
          created_at: string
          generated_image_url: string | null
          id: string
          scene_number: number
          scene_text: string
          story_id: string
        }
        Insert: {
          created_at?: string
          generated_image_url?: string | null
          id?: string
          scene_number: number
          scene_text: string
          story_id: string
        }
        Update: {
          created_at?: string
          generated_image_url?: string | null
          id?: string
          scene_number?: number
          scene_text?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_scenes_story_id_fkey"
            columns: ["story_id"]
            referencedRelation: "stories"
            referencedColumns: ["id"]
          }
        ]
      }
      system_stats: {
        Row: {
          id: string
          images_generated: number | null
          new_users: number | null
          stat_date: string
          stories_created: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          images_generated?: number | null
          new_users?: number | null
          stat_date?: string
          stories_created?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          images_generated?: number | null
          new_users?: number | null
          stat_date?: string
          stories_created?: number | null
          updated_at?: string
        }
      }
      user_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_images_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: {
          uid: string
        }
        Returns: boolean
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