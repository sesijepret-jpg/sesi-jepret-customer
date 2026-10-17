import { Layout as ILayout } from '../types';
import { SlotModel } from './slot_model';

export class LayoutModel implements ILayout {
  readonly id: string;
  readonly slots: SlotModel[];
  readonly drawOnTop?: boolean;

  constructor(data: ILayout) {
    this.id = data.id;
    this.slots = data.slots.map(s => s instanceof SlotModel ? s : new SlotModel(s));
    this.drawOnTop = data.drawOnTop;
  }

  static fromFirestore(docId: string, data: Record<string, any>): LayoutModel {
    const slotsList: SlotModel[] = [];

    if (data && Array.isArray(data.slots)) {
      data.slots.forEach((item, i) => {
        if (item && typeof item === 'object') {
          slotsList.push(SlotModel.fromMap(item, i + 1));
        }
      });
    } else if (data) {
      // Fallback search key-value slots like slot1, slot2
      Object.keys(data).forEach((key) => {
        if (key.startsWith('slot')) {
          const val = data[key];
          if (val && typeof val === 'object') {
            const slotNum = parseInt(key.replace('slot', ''), 10) || 1;
            slotsList.push(SlotModel.fromMap(val, slotNum));
          }
        }
      });
    }

    // Sort by slotNumber to ensure order
    slotsList.sort((a, b) => a.slotNumber - b.slotNumber);

    return new LayoutModel({
      id: docId,
      slots: slotsList,
      drawOnTop: data.drawOnTop,
    });
  }

  toFirestore(): Record<string, any> {
    return {
      slots: this.slots.map((s) => s.toMap()),
      drawOnTop: this.drawOnTop,
    };
  }

  static get fallback(): LayoutModel {
    return new LayoutModel({
      id: 'fallback',
      slots: [
        new SlotModel({ slotNumber: 1, x: 70, y: 120, width: 460, height: 460, rotation: 0, fit: 'cover', radius: 0, opacity: 1 }),
        new SlotModel({ slotNumber: 2, x: 70, y: 620, width: 460, height: 460, rotation: 0, fit: 'cover', radius: 0, opacity: 1 }),
        new SlotModel({ slotNumber: 3, x: 70, y: 1120, width: 460, height: 460, rotation: 0, fit: 'cover', radius: 0, opacity: 1 }),
      ],
    });
  }
}
