// V2 metadata builder. Output shape is ERC-721-standard compliant.
// Locked schema — see .forge/plan.md §5.

import { aggregatorUrl } from './walrus';
import { walruscanUrl } from './walruscan';

export type Category = 'Art' | 'Photo' | 'Meme' | 'Other';

export interface MetadataInput {
  name: string;
  description: string;
  blobIdImage: string;
  category: Category;
  vibe: string;
  createdAt: number;
}

export interface MetadataAttribute {
  trait_type: string;
  value: string | number;
  display_type?: 'date' | 'number' | 'string';
}

export interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: MetadataAttribute[];
}

/**
 * Returns the ERC-721-standard JSON shape:
 *   { "name": "...", "description": "...", "image": "...", "external_url": "...", "attributes": [...] }
 */
export function buildMetadata(input: MetadataInput): NFTMetadata {
  return {
    name: input.name,
    description: input.description,
    image: aggregatorUrl(input.blobIdImage),
    external_url: walruscanUrl(input.blobIdImage),
    attributes: [
      { trait_type: 'Category', value: input.category },
      { trait_type: 'Vibe', value: input.vibe },
      { trait_type: 'Created', display_type: 'date', value: input.createdAt },
    ],
  };
}
