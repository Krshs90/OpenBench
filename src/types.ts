export interface LocalModel {
  name: string;
  size: string;
  format: string;
  family?: string;
  parameter_size?: string;
  quantization_level?: string;
  engine: string;
  path?: string;
  status?: string;
  links?: string[];
}

export interface RunningModel {
  name: string;
  size: number;
  size_vram: number;
}
