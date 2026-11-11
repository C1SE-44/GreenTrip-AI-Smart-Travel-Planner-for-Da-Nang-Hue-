// url=https://www.figma.com/design/l8xtGW3mDktovwTacPRDzU/L%E1%BB%A3i-Tr%E1%BA%A7n's-team-library?node-id=0:1
// source=frontend/src/components/ui/Button.tsx
// component=Button
import figma from 'figma'

const instance = figma.selectedInstance

// Extract properties from the Figma component
const label = instance.getString('Label') ?? 'Button'

const variant = instance.getEnum('Variant', {
  'Primary': 'primary',
  'Secondary': 'secondary',
  'Ghost': 'ghost',
})

const size = instance.getEnum('Size', {
  'Small': 'sm',
  'Medium': 'md',
  'Large': 'lg',
})

const loading = instance.getBoolean('Loading')
const disabled = instance.getBoolean('Disabled')

export default {
  example: figma.code`<Button${variant ? ` variant="${variant}"` : ''}${size ? ` size="${size}"` : ''}${loading ? ' loading' : ''}${disabled ? ' disabled' : ''}>${label}</Button>`,
  imports: ["import Button from '@/components/ui/Button'"],
  id: 'button',
  metadata: {
    nestable: true,
  },
}
