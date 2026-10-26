import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

// Mesmo preset do AgroMind (theme/agromind-preset.js): cada token do Aura aponta para uma variável
// de assets/edumind-tokens.css, ou um color-mix() sobre ela para os tons derivados.
const EduMindPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: 'color-mix(in oklch, var(--primary) 8%, white)',
      100: 'color-mix(in oklch, var(--primary) 18%, white)',
      200: 'color-mix(in oklch, var(--primary) 32%, white)',
      300: 'color-mix(in oklch, var(--primary) 48%, white)',
      400: 'color-mix(in oklch, var(--primary) 70%, white)',
      500: 'var(--primary)',
      600: 'var(--primary)',
      700: 'color-mix(in oklch, var(--primary) 85%, black)',
      800: 'color-mix(in oklch, var(--primary) 70%, black)',
      900: 'color-mix(in oklch, var(--primary) 55%, black)',
      950: 'color-mix(in oklch, var(--primary) 40%, black)'
    },
    colorScheme: {
      light: {
        surface: {
          0: 'var(--card)',
          50: 'var(--background)',
          100: 'var(--muted)',
          200: 'var(--border)',
          300: 'color-mix(in oklch, var(--border) 55%, var(--muted-foreground))',
          400: 'color-mix(in oklch, var(--muted-foreground) 55%, var(--border))',
          500: 'var(--muted-foreground)',
          600: 'color-mix(in oklch, var(--muted-foreground) 45%, var(--foreground))',
          700: 'var(--foreground)',
          800: 'color-mix(in oklch, var(--foreground) 85%, black)',
          900: 'color-mix(in oklch, var(--foreground) 70%, black)',
          950: 'color-mix(in oklch, var(--foreground) 55%, black)'
        },
        primary: {
          color: 'var(--primary)',
          contrastColor: 'var(--primary-foreground)',
          hoverColor: 'color-mix(in oklch, var(--primary) 85%, black)',
          activeColor: 'color-mix(in oklch, var(--primary) 70%, black)'
        },
        // O texto de exemplo dos campos mais claro que o padrão do Aura (o cinza dos textos secundários): é exemplo,
        // não valor preenchido.
        formField: {
          placeholderColor: 'color-mix(in oklch, var(--muted-foreground) 50%, var(--border))'
        }
      }
    }
  }
})

export default EduMindPreset
