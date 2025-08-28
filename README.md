# Content Management Hub

A React-based content management system for managing projects, clients, editors, and content pieces with Supabase backend and S3 file storage.

## Current Status

✅ **MVP Complete** - All core functionality working
✅ **Critical Bugs Fixed** - State mutation, S3/DB sync issues resolved
⚠️ **Monolithic Component** - Single 5k-line component needs refactoring
⚠️ **Security Concerns** - API keys exposed in client-side code

## Features

- **Project Management**: Create, edit, delete projects with status tracking
- **Client Management**: Manage client information and project assignments
- **Editor Assignment**: Assign editors to content pieces with timezone support
- **File Upload**: S3 integration for project file storage
- **Content Tracking**: Track posted content with editor assignments
- **Google Drive Links**: Add asset links to projects
- **Dashboard**: Real-time project statistics and filtering

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **File Storage**: AWS S3
- **Deployment**: Vercel

## Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Run the development server: `npm start`

## Environment Variables

```env
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_AWS_ACCESS_KEY_ID=your_aws_access_key
REACT_APP_AWS_SECRET_ACCESS_KEY=your_aws_secret_key
REACT_APP_AWS_REGION=us-east-1
REACT_APP_S3_BUCKET_NAME=your_s3_bucket
```

## Database Schema

The application uses Supabase with the following main tables:
- `projects` - Project information and metadata
- `clients` - Client contact information
- `editors` - Editor profiles with timezone data
- `posted_content` - Content pieces with editor assignments
- `project_files` - File metadata linked to projects

## Future Development Plans

### 🔴 Critical Issues (Fix First)

1. **Security Hardening**
   - Move AWS credentials to server-side API routes
   - Implement proper authentication (replace `CLIENT_PASSWORD = 'admin123'`)
   - Use Supabase Storage instead of direct S3 access
   - Add Row Level Security (RLS) policies

2. **Data Consistency**
   - Normalize date formats (use ISO everywhere)
   - Add proper error handling and validation
   - Implement optimistic updates for better UX

### 🟡 Architecture Improvements (Medium Priority)

3. **Component Refactoring**
   ```
   src/
     components/
       ProjectCard.tsx
       ProjectFilters.tsx
       Modals/
         ProjectNewModal.tsx
         ProjectEditModal.tsx
         PostNewModal.tsx
         PostEditModal.tsx
     hooks/
       useProjects.ts
       useClients.ts
       useEditors.ts
       usePostedContent.ts
     services/
       supabase.ts
       s3.ts
     utils/
       dates.ts
       files.ts
       status.ts
       timezone.ts
     types/
       index.ts
   ```

4. **State Management**
   - Extract custom hooks for data operations
   - Use React Query for caching and optimistic updates
   - Consider Zustand for complex UI state

### 🟢 Performance & UX (Lower Priority)

5. **Performance Optimizations**
   - Memoize expensive calculations with `useMemo`
   - Use `useCallback` for event handlers
   - Implement virtual scrolling for large lists
   - Add loading states and skeleton screens

6. **User Experience**
   - Replace `alert()`/`prompt()` with toast notifications
   - Add keyboard shortcuts
   - Implement drag-and-drop for file uploads
   - Add bulk operations (delete multiple, status updates)

### 🔵 Advanced Features (Future)

7. **Enhanced Functionality**
   - Real-time collaboration with Supabase subscriptions
   - Advanced search and filtering
   - Export functionality (PDF reports, CSV data)
   - Integration with external tools (Slack, email)
   - Mobile-responsive design improvements

## Development Guidelines

### Code Quality
- Use TypeScript strictly (no `any` types)
- Follow React best practices (hooks, functional components)
- Implement proper error boundaries
- Add comprehensive testing (Jest, React Testing Library)

### Database
- Use Supabase migrations for schema changes
- Implement proper RLS policies
- Add database constraints and validation
- Use TypeScript types generated from Supabase schema

### Security
- Never expose API keys in client-side code
- Implement proper authentication and authorization
- Validate all user inputs
- Use HTTPS for all external requests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.