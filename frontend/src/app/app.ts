import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FormsModule } from '@angular/forms';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
}

@Component({
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MatToolbarModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly messages = signal<Message[]>([]);
  protected readonly loading = signal(false);
  protected question = '';
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  protected async ask(): Promise<void> {
    const question = this.question.trim();
    if (!question || this.loading()) return;

    const previous = [...this.messages()].reverse().find((m) => m.role === 'assistant' && m.sources?.length);
    const previousSources = previous?.sources ?? [];
    const history = this.messages()
      .filter((m) => m.text.trim())
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));
    this.question = '';
    this.messages.update((m) => [...m, { role: 'user', text: question }]);
    const reply: Message = { role: 'assistant', text: '' };
    this.messages.update((m) => [...m, reply]);
    this.loading.set(true);
    this.scrollToEnd();

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, previousSources, history }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        reply.text = data.error ?? 'No se pudo obtener la respuesta.';
        return;
      }

      const raw = res.headers.get('X-Sources');
      reply.sources = raw ? JSON.parse(decodeURIComponent(raw)) : [];
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.text += decoder.decode(value, { stream: true });
        this.messages.update((m) => [...m]);
        this.scrollToEnd();
      }
    } catch {
      reply.text = 'No hay conexión con el servidor de Anna IA.';
    } finally {
      this.messages.update((m) => [...m]);
      this.loading.set(false);
    }
  }

  private scrollToEnd(): void {
    queueMicrotask(() => {
      const el = this.log()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
