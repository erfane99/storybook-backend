// Minimal service contracts for API routes
// These interfaces define the contract between API routes and the worker service

// ===== AI SERVICE INTERFACES =====
export interface IAIService {
  generateScenesWithAudience(options: SceneGenerationOptions): Promise<SceneGenerationResult>;
  generateSceneImage(options: ImageGenerationOptions): Promise<ImageGenerationResult>;
  generateCharacterDescription(options: CharacterDescriptionOptions): Promise<CharacterDescriptionResult>;
  generateStoryWithOptions(options: StoryGenerationOptions): Promise<StoryGenerationResult>;
  processCartoonize(options: CartoonizeOptions): Promise<CartoonizeResult>;
}

// ===== SCENE GENERATION =====
export interface SceneGenerationOptions {
  story: string;
  audience?: 'children' | 'young adults' | 'adults';
  characterImage?: string;
  characterArtStyle?: string;
  layoutType?: string;
  enhancedContext?: any;
}

export interface SceneGenerationResult {
  pages: any[];
  audience: string;
  characterImage?: string;
  layoutType: string;
  characterArtStyle: string;
  metadata: {
    narrativeIntelligenceApplied?: boolean;
    characterConsistencyEnabled?: boolean;
    environmentalConsistencyEnabled?: boolean;
    emotionalProgressionMapped?: boolean;
    panelOptimizationApplied?: boolean;
    visualPrioritySystemActive?: boolean;
  };
}

// ===== IMAGE GENERATION =====
export interface ImageGenerationOptions {
  image_prompt: string;
  character_description: string;
  emotion: string;
  audience: string;
  isReusedImage?: boolean;
  cartoon_image?: string;
  user_id?: string;
  style?: string;
  characterArtStyle?: string;
  layoutType?: string;
  panelType?: string;
  environmentalContext?: any;
}

export interface ImageGenerationResult {
  url: string;
  prompt_used: string;
  reused: boolean;
  cached?: boolean;
  visualDNA?: any;
  qualityMetrics?: any;
}

// ===== CHARACTER DESCRIPTION =====
export interface CharacterDescriptionOptions {
  imageUrl: string;
  includeVisualDNA?: boolean;
  includePersonality?: boolean;
  includeClothing?: boolean;
  includeBackground?: boolean;
  generateFingerprint?: boolean;
}

export interface CharacterDescriptionResult {
  characterDescription: string;
  visualDNA?: any;
  fingerprint?: string;
  confidence?: number;
  details?: {
    physicalFeatures?: string;
    clothing?: string;
    expression?: string;
    colors?: string[];
    style?: string;
  };
}

// ===== STORY GENERATION =====
export interface StoryGenerationOptions {
  genre: string;
  characterDescription: string;
  audience?: string;
  length?: string;
  tone?: string;
}

export interface StoryGenerationResult {
  story: string;
  title?: string;
  genre: string;
  audience: string;
  storyArchetype?: string;
  emotionalArc?: string[];
  metadata?: any;
}

// ===== CARTOONIZE =====
export interface CartoonizeOptions {
  prompt: string;
  style: string;
  imageUrl?: string;
  userId?: string;
}

export interface CartoonizeResult {
  url: string;
  cached: boolean;
  prompt_used?: string;
  visualDNA?: any;
}