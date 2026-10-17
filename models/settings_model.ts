import { Settings as ISettings } from '../types';

export class SettingsModel implements ISettings {
  readonly sessionDuration: number;
  readonly inactivityTimeout: number;
  readonly logoUrl: string;
  readonly boothName: string;
  readonly photoCount: number;
  readonly printSize: string;
  readonly emailEnabled: boolean;
  readonly printerEnabled: boolean;
  readonly autoDetectCamera: boolean;

  constructor(data: Partial<ISettings> = {}) {
    this.sessionDuration = data.sessionDuration ?? 600;
    this.inactivityTimeout = data.inactivityTimeout ?? 120;
    this.logoUrl = data.logoUrl ?? '';
    this.boothName = data.boothName ?? 'Sesijepret Photo Booth';
    this.photoCount = data.photoCount ?? 4;
    this.printSize = data.printSize ?? '2x6';
    this.emailEnabled = data.emailEnabled ?? true;
    this.printerEnabled = data.printerEnabled ?? true;
    this.autoDetectCamera = data.autoDetectCamera ?? true;
  }

  static fromFirestore(docId: string, data: Record<string, any>): SettingsModel {
    return new SettingsModel({
      sessionDuration: typeof data.session_duration === 'number' ? data.session_duration : 600,
      inactivityTimeout: typeof data.inactivity_timeout === 'number' ? data.inactivity_timeout : 120,
      logoUrl: data.logo_url || '',
      boothName: data.booth_name || 'Sesijepret Photo Booth',
      photoCount: typeof data.photo_count === 'number' ? data.photo_count : 4,
      printSize: data.print_size || '2x6',
      emailEnabled: data.email_enabled !== undefined ? !!data.email_enabled : true,
      printerEnabled: data.printer_enabled !== undefined ? !!data.printer_enabled : true,
      autoDetectCamera: data.auto_detect_camera !== undefined ? !!data.auto_detect_camera : true,
    });
  }

  toFirestore(): Record<string, any> {
    return {
      session_duration: this.sessionDuration,
      inactivity_timeout: this.inactivityTimeout,
      logo_url: this.logoUrl,
      booth_name: this.boothName,
      photo_count: this.photoCount,
      print_size: this.printSize,
      email_enabled: this.emailEnabled,
      printer_enabled: this.printerEnabled,
      auto_detect_camera: this.autoDetectCamera,
    };
  }

  static get defaults(): SettingsModel {
    return new SettingsModel();
  }
}
