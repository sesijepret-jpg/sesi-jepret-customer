import { NextResponse } from 'next/server';
import { TemplateModel } from '@/models/template_model';

export async function GET() {
  try {
    return NextResponse.json({ templates: TemplateModel.localTemplates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ templates: [] }, { status: 500 });
  }
}
