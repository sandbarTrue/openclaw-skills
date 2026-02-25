# 🐱 Neko Pet

> A living AI cat companion for OpenClaw with mood system, hunger mechanics, memory, and beautiful CSS fluid ball visualization.

![Neko Pet Preview](https://via.placeholder.com/800x400/0f0f1a/a29bfe?text=🐱+Neko+Pet+Preview)

## Features

- **🎭 7 Mood States** - Idle, Happy, Sleepy, Hungry, Angry, Lovey, Curious
- **🍖 Hunger System** - Feed your cat to keep her happy (decreases -5/hour)
- **🧠 Memory** - Neko remembers your conversations and preferences
- **⭐ Evolution** - Level up from Kitten to Wise Cat through interactions
- **🎨 Beautiful Visualization** - CSS fluid glass ball cat with organic silhouette

## Installation

```bash
clawhub install neko-pet
```

Or manually clone to your OpenClaw skills directory:
```bash
cd ~/.openclaw/workspace/skills/
git clone https://github.com/sandbarTrue/neko-pet.git
```

## Quick Start

After installation, initialize your cat:
```bash
bash ~/.openclaw/workspace/skills/neko-pet/scripts/neko.sh init --name Mimi
```

Then just talk to your OpenClaw agent:
- **"打开猫咪"** or **"show my cat"** - Display Neko's visual canvas
- **"喂猫"** or **"feed cat"** - Feed Neko (fish, meat, milk, or treat)
- **"摸猫"** or **"pet cat"** - Pet Neko for happiness and XP

## Commands

| Command | Action |
|---------|--------|
| `neko.sh init [--name NAME]` | Initialize your cat |
| `neko.sh status` | Show current stats |
| `neko.sh feed [food]` | Feed (fish/meat/milk/treat) |
| `neko.sh pet` | Pet Neko |
| `neko.sh play` | Play with Neko |
| `neko.sh update` | Calculate time-based decay |
| `neko.sh canvas-url` | Generate visualization URL |

## Food Types

| Food | Hunger Bonus |
|------|-------------|
| 🐟 Fish | +30 |
| 🍖 Meat | +20 |
| 🥛 Milk | +15 |
| 🍬 Treat | +10 |

## Level Progression

| Level | Name | XP Required |
|-------|------|-------------|
| 1 | Kitten | 0 |
| 2 | Young Cat | 50 |
| 3 | Adult Cat | 150 |
| 4 | Wise Cat | 500 |

## Screenshots

| Mood | Preview |
|------|---------|
| Happy | ![Happy](https://via.placeholder.com/200x200/f9ca24/fff?text=😄) |
| Sleepy | ![Sleepy](https://via.placeholder.com/200x200/74b9ff/fff?text=😴) |
| Lovey | ![Lovey](https://via.placeholder.com/200x200/fd79a8/fff?text=🥰) |

## Tech Stack

- Pure HTML/CSS/JavaScript (no dependencies)
- SVG clipPath for organic cat silhouette
- CSS animations for fluid effects
- JSON-based state management

## Contributing

Contributions are welcome! Feel free to:
- Add new mood states
- Improve animations
- Add mini-games
- Enhance memory system

## License

MIT License - Free to use, modify, and share.

---

*Made with 💛 by [sandbarTrue](https://github.com/sandbarTrue) & 瓦力*
