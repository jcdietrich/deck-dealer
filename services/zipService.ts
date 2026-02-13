
import JSZip from 'jszip';
import { CardImage } from '../types';

export const extractImagesFromZip = async (file: File): Promise<CardImage[]> => {
  const zip = new JSZip();
  const content = await zip.loadAsync(file);
  const images: CardImage[] = [];

  const imageRegex = /\.(png|jpe?g|webp)$/i;

  const entries = Object.keys(content.files).filter(name => !content.files[name].dir && imageRegex.test(name));

  for (const name of entries) {
    const zipEntry = content.files[name];
    const blob = await zipEntry.async('blob');
    
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    const filename = name.split('/').pop() || name;
    // Clean extension for default title
    const defaultTitle = filename.replace(/\.[^/.]+$/, "");

    images.push({
      name: filename,
      title: defaultTitle,
      data: base64,
      type: blob.type,
      tags: [], // Initialize with empty tags
      note: '' // Initialize with empty note
    });
  }

  return images;
};
