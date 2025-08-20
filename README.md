# Content Management Hub

A React-based content management system designed specifically for cannabis/hemp businesses to streamline project workflows, client communication, and content creation with AI assistance.

## Features

- **Smart Project Dashboard** - Visual overview of all client projects with status tracking
- **AI Content Assistant** - Claude integration for content ideas, captions, and planning
- **Project Creation & Management** - Create new projects with client details and deadlines
- **Status Tracking** - Track project versions and approval states
- **File Upload Support** - Handle video, image, and document uploads
- **Client Communication** - Centralized project feedback and messaging

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Add your Anthropic API key to the `.env` file:
   ```
   REACT_APP_ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

3. **Start the development server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

## Project Structure

```
content-management-hub/
├── public/
│   └── index.html
├── src/
│   ├── index.tsx
│   └── index.css
├── content-management-hub.tsx    # Main component
├── package.json
├── tailwind.config.js
└── README.md
```

## Current Status

✅ **Completed Features:**
- Project dashboard with status indicators
- AI assistant with Claude integration
- New project creation modal
- File upload interface
- Project detail views
- Responsive design with Tailwind CSS

🚧 **In Development:**
- Calendar view for project deadlines
- Client management system
- File storage and version control
- Advanced project filtering

## Future Enhancements

### Multi-User Access System (Planned)
- **URL-Based Access Control**: Implement role-based views using URL parameters
  - `?view=client&client=GreenHaus` → Client-specific view
  - `?view=editor&editor=John` → Editor-specific view
  - No URL params → Full admin view
- **Data Filtering**: Filter projects, content calendar, and dashboard based on user role
- **Supabase Integration**: Leverage existing database structure with client/editor fields
- **No Database Changes**: All filtering happens in React frontend, database remains unchanged
- **Easy Implementation**: Simple URL parameter reading and content filtering
- **Secure Sharing**: Share specific URLs with clients/editors for their content only

## Tech Stack

- **Frontend:** React 18 with TypeScript
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **AI Integration:** Anthropic Claude API
- **Build Tool:** Create React App

## Usage

1. **Creating Projects:** Click "New Project" to add client projects with deadlines
2. **AI Assistant:** Use the AI button to get content ideas and social media suggestions
3. **Project Management:** Track status changes from in-progress to review to approved
4. **File Uploads:** Upload content files directly to projects (coming soon)

## Environment Setup

The app requires an Anthropic API key for AI features. Get one at [console.anthropic.com](https://console.anthropic.com) and add it to your `.env` file.

## Contributing

This is a specialized tool for cannabis/hemp content creators. Future enhancements welcome!