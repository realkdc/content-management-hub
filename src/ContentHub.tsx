import React, { useState, useRef, useEffect } from 'react';
import { Plus, Upload, Calendar, BarChart3, User, Video, Image, FileText, Clock, CheckCircle, AlertCircle, X, Edit, Trash2, Eye, Download } from 'lucide-react';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase, DatabaseProject, DatabaseClient } from './supabaseClient';

type ProjectStatus = 'draft' | 'editor_review' | 'client_review' | 'needs_revision' | 'approved' | 'final_delivered';
type ContentType = 'video' | 'image' | 'text';
type PostStatus = 'scheduled' | 'posted' | 'draft';

interface PostedContent {
  id: number;
  projectId: number;
  projectTitle: string;
  client: string;
  contentForm: string;
  contentBucket: string;
  numberOfContent: number;
  link: string;
  caption: string;
  feedback: string;
  comments: string;
  numberOfLikes: number;
  liveLink: string;
  platform: string;
  scheduledDate: string;
  postedDate: string;
  status: PostStatus;
  analytics: {
    views?: number;
    shares?: number;
    saves?: number;
    reach?: number;
  };
}


interface Project {
  id: number;
  client: string;
  title: string;
  type: ContentType;
  subtype?: string; // e.g., "Instagram Reel", "TikTok Video", "Blog Post"
  status: ProjectStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  version: number;
  dueDate: string;
  estimatedHours?: number;
  budget?: number;
  description: string;
  objectives?: string; // What's the goal of this content?
  targetAudience?: string;
  platforms?: string[]; // Instagram, TikTok, etc.
  deliverables?: string; // What exactly will be delivered
  feedback: string | null;
  lastActivity: string;
  files?: ProjectFile[];
  tags?: string[]; // Custom tags for better organization
}

interface ProjectFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadDate: string;
  url?: string;
  s3Key?: string; // S3 object key for cloud storage
  version: string; // e.g., "1.0", "1.1", "2.0"
  uploadedBy?: string; // Who uploaded this version
  isLatest: boolean; // Is this the current/latest version
  previousVersionId?: string; // Link to previous version
}

interface Client {
  id: number;
  name: string;
  email: string;
  company: string;
  phone?: string;
  projects: number[];
  createdDate: string;
}

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY || ''
  }
});

const S3_BUCKET_NAME = process.env.REACT_APP_S3_BUCKET_NAME || 'content-management-hub';

// Helper function to map old status values to new workflow statuses
const mapOldStatusToNew = (oldStatus: any): ProjectStatus => {
  const statusMap: {[key: string]: ProjectStatus} = {
    'in_progress': 'draft',
    'pending_review': 'client_review',
    'needs_revision': 'needs_revision',
    'approved': 'approved',
    // New statuses map to themselves
    'draft': 'draft',
    'editor_review': 'editor_review',
    'client_review': 'client_review',
    'final_delivered': 'final_delivered'
  };
  return statusMap[oldStatus] || 'draft';
};

// Local Storage helpers - REMOVED as requested
// const saveToLocalStorage = (key: string, data: any) => {
//   try {
//     localStorage.setItem(key, JSON.stringify(data));
//   } catch (error) {
//     console.error('Error saving to localStorage:', error);
//   }
// };

// Supabase data functions
const loadProjectsFromSupabase = async (): Promise<Project[]> => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    const projects = await Promise.all((data || []).map(async (project: DatabaseProject) => ({
      id: project.id,
      client: project.client,
      title: project.title,
      type: project.type,
      subtype: project.subtype,
      status: mapOldStatusToNew(project.status),
      priority: project.priority,
      version: project.version,
      dueDate: project.due_date,
      estimatedHours: project.estimated_hours,
      budget: project.budget,
      description: project.description,
      objectives: project.objectives,
      targetAudience: project.target_audience,
      platforms: project.platforms || [],
      deliverables: project.deliverables,
      feedback: project.feedback || null,
      lastActivity: project.last_activity,
      tags: project.tags || [],
      files: await loadFilesForProject(project.id)
    })));
    
    return projects;
  } catch (error) {
    console.error('Error loading projects:', error);
    return [];
  }
};

const loadClientsFromSupabase = async (): Promise<Client[]> => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map((client: DatabaseClient) => ({
      id: client.id,
      name: client.name,
      email: client.email,
      company: client.company,
      phone: client.phone,
      projects: [], // We'll populate this separately if needed
      createdDate: client.created_date
    }));
  } catch (error) {
    console.error('Error loading clients:', error);
    return [];
  }
};

const saveClientToSupabase = async (client: Omit<Client, 'id' | 'createdDate'>): Promise<Client> => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .insert([{
        name: client.name,
        email: client.email,
        company: client.company,
        phone: client.phone
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      company: data.company,
      phone: data.phone,
      projects: [],
      createdDate: data.created_date
    };
  } catch (error) {
    console.error('Error saving client:', error);
    throw error;
  }
};

const updateClientInSupabase = async (clientId: number, updates: Partial<Client>): Promise<void> => {
  try {
    const { error } = await supabase
      .from('clients')
      .update({
        name: updates.name,
        email: updates.email,
        company: updates.company,
        phone: updates.phone
      })
      .eq('id', clientId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating client:', error);
    throw error;
  }
};

const updateProjectInSupabase = async (projectId: number, updates: Partial<Project>): Promise<void> => {
  try {
    const { error } = await supabase
      .from('projects')
      .update({
        client: updates.client,
        title: updates.title,
        type: updates.type,
        subtype: updates.subtype,
        priority: updates.priority,
        due_date: updates.dueDate,
        estimated_hours: updates.estimatedHours,
        budget: updates.budget,
        description: updates.description,
        objectives: updates.objectives,
        target_audience: updates.targetAudience,
        platforms: updates.platforms,
        deliverables: updates.deliverables,
        tags: updates.tags,
        last_activity: 'Project updated'
      })
      .eq('id', projectId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error updating project:', error);
    throw error;
  }
};

const deleteClientFromSupabase = async (clientId: number): Promise<void> => {
  try {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', clientId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting client:', error);
    throw error;
  }
};

const saveFileToSupabase = async (projectId: number, file: ProjectFile): Promise<void> => {
  try {
    const { error } = await supabase
      .from('project_files')
      .insert([{
        project_id: projectId,
        name: file.name,
        size: file.size,
        type: file.type,
        s3_key: file.s3Key,
        url: file.url,
        upload_date: new Date().toISOString(),
        version: file.version,
        uploaded_by: file.uploadedBy,
        is_latest: file.isLatest,
        previous_version_id: file.previousVersionId
      }]);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error saving file record:', error);
    throw error;
  }
};

const loadFilesForProject = async (projectId: number): Promise<ProjectFile[]> => {
  try {
    const { data, error } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('upload_date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.type,
      url: file.url,
      s3Key: file.s3_key,
      uploadDate: file.upload_date,
      version: file.version || '1.0', // Default version for old files
      uploadedBy: file.uploaded_by || 'Unknown',
      isLatest: file.is_latest !== undefined ? file.is_latest : true, // Default to latest for old files
      previousVersionId: file.previous_version_id
    }));
  } catch (error) {
    console.error('Error loading files:', error);
    return [];
  }
};

const loadPostedContentFromSupabase = async (): Promise<PostedContent[]> => {
  try {
    const { data, error } = await supabase
      .from('posted_content')
      .select('*')
      .order('scheduled_date', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map((post: any) => ({
      id: post.id,
      projectId: post.project_id,
      projectTitle: post.project_title,
      client: post.client,
      contentForm: post.content_form,
      contentBucket: post.content_bucket,
      numberOfContent: post.number_of_content,
      link: post.link,
      caption: post.caption,
      feedback: post.feedback,
      comments: post.comments,
      numberOfLikes: post.number_of_likes,
      liveLink: post.live_link,
      platform: post.platform,
      scheduledDate: post.scheduled_date,
      postedDate: post.posted_date,
      status: post.status,
      analytics: post.analytics || {}
    }));
  } catch (error) {
    console.error('Error loading posted content:', error);
    return [];
  }
};

const savePostedContentToSupabase = async (post: Omit<PostedContent, 'id'>): Promise<PostedContent> => {
  try {
    const { data, error } = await supabase
      .from('posted_content')
      .insert([{
        project_id: post.projectId,
        project_title: post.projectTitle,
        client: post.client,
        content_form: post.contentForm,
        content_bucket: post.contentBucket,
        number_of_content: post.numberOfContent,
        link: post.link,
        caption: post.caption,
        feedback: post.feedback,
        comments: post.comments,
        number_of_likes: post.numberOfLikes,
        live_link: post.liveLink,
        platform: post.platform,
        scheduled_date: post.scheduledDate,
        posted_date: post.postedDate,
        status: post.status,
        analytics: post.analytics
      }])
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      projectId: data.project_id,
      projectTitle: data.project_title,
      client: data.client,
      contentForm: data.content_form,
      contentBucket: data.content_bucket,
      numberOfContent: data.number_of_content,
      link: data.link,
      caption: data.caption,
      feedback: data.feedback,
      comments: data.comments,
      numberOfLikes: data.number_of_likes,
      liveLink: data.live_link,
      platform: data.platform,
      scheduledDate: data.scheduled_date,
      postedDate: data.posted_date,
      status: data.status,
      analytics: data.analytics || {}
    };
  } catch (error) {
    console.error('Error saving posted content:', error);
    throw error;
  }
};

const deletePostedContentFromSupabase = async (postId: number): Promise<void> => {
  try {
    const { error } = await supabase
      .from('posted_content')
      .delete()
      .eq('id', postId);
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error deleting posted content:', error);
    throw error;
  }
};

const clearAllPostedContentFromSupabase = async (): Promise<void> => {
  try {
    const { error } = await supabase
      .from('posted_content')
      .delete()
      .neq('id', 0); // Delete all records
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error clearing posted content:', error);
    throw error;
  }
};

const updatePostedContentInSupabase = async (postId: number, updates: Partial<PostedContent>): Promise<void> => {
  try {
    // Clean and validate the data before sending to database
    const cleanUpdates: any = {};
    
    if (updates.projectTitle) cleanUpdates.project_title = updates.projectTitle;
    if (updates.client) cleanUpdates.client = updates.client;
    if (updates.contentForm) cleanUpdates.content_form = updates.contentForm;
    if (updates.contentBucket) cleanUpdates.content_bucket = updates.contentBucket;
    if (updates.numberOfContent !== undefined) cleanUpdates.number_of_content = updates.numberOfContent;
    if (updates.link) cleanUpdates.link = updates.link;
    if (updates.caption) cleanUpdates.caption = updates.caption;
    if (updates.feedback) cleanUpdates.feedback = updates.feedback;
    if (updates.comments) cleanUpdates.comments = updates.comments;
    if (updates.numberOfLikes !== undefined) cleanUpdates.number_of_likes = updates.numberOfLikes;
    if (updates.liveLink) cleanUpdates.live_link = updates.liveLink;
    if (updates.platform) cleanUpdates.platform = updates.platform;
    if (updates.status) cleanUpdates.status = updates.status;
    if (updates.analytics) cleanUpdates.analytics = updates.analytics;
    
    // Handle dates properly - only include if they're valid
    if (updates.scheduledDate && updates.scheduledDate !== 'mm/dd/yyyy') {
      cleanUpdates.scheduled_date = updates.scheduledDate;
    }
    if (updates.postedDate && updates.postedDate !== 'mm/dd/yyyy') {
      cleanUpdates.posted_date = updates.postedDate;
    }
    
    console.log('Updating post with data:', cleanUpdates);
    
    const { error } = await supabase
      .from('posted_content')
      .update(cleanUpdates)
      .eq('id', postId);
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error updating posted content:', error);
    throw error;
  }
};



const ContentHub = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientsUnlocked, setClientsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  // Simple password protection for clients section
  const CLIENT_PASSWORD = 'admin123'; // You can change this to whatever you want
  
  const handleClientPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === CLIENT_PASSWORD) {
      setClientsUnlocked(true);
      setPasswordInput('');
    } else {
      alert('Incorrect password');
      setPasswordInput('');
    }
  };

  // Load data from Supabase on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [projectsData, clientsData, postedContentData] = await Promise.all([
          loadProjectsFromSupabase(),
          loadClientsFromSupabase(),
          loadPostedContentFromSupabase()
        ]);
        setProjects(projectsData);
        setClients(clientsData);
        setPostedContent(postedContentData);
      } catch (error) {
        console.error('Error loading data:', error);
        // If there's an error (like missing table), start with empty data
        setProjects([]);
        setClients([]);
        setPostedContent([]);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  // Sample projects are now loaded from Supabase database

  const [clients, setClients] = useState<Client[]>([]);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'client' | 'status' | 'type'>('dueDate');
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [showEditClientModal, setShowEditClientModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackInput, setFeedbackInput] = useState('');
  const [postedContent, setPostedContent] = useState<PostedContent[]>([]);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [showEditPostModal, setShowEditPostModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<PostedContent | null>(null);
  const currentUser = {
    name: 'Admin User', // In real app, this would come from authentication
    email: 'admin@example.com'
  };
  const [newProject, setNewProject] = useState<{
    client: string;
    title: string;
    type: ContentType;
    subtype: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    dueDate: string;
    estimatedHours: number;
    budget: number;
    description: string;
    objectives: string;
    targetAudience: string;
    platforms: string[];
    deliverables: string;
    tags: string[];
  }>({
    client: '',
    title: '',
    type: 'video',
    subtype: '',
    priority: 'medium',
    dueDate: '',
    estimatedHours: 0,
    budget: 0,
    description: '',
    objectives: '',
    targetAudience: '',
    platforms: [],
    deliverables: '',
    tags: []
  });
  const [newClient, setNewClient] = useState<{ name: string; email: string; company: string; phone: string }>({
    name: '',
    email: '',
    company: '',
    phone: ''
  });
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newPost, setNewPost] = useState<{
    projectId: number;
    projectTitle: string;
    client: string;
    contentForm: string;
    contentBucket: string;
    numberOfContent: number;
    link: string;
    caption: string;
    feedback: string;
    comments: string;
    numberOfLikes: number;
    liveLink: string;
    platform: string;
    scheduledDate: string;
    postedDate: string;
    status: PostStatus;
    analytics: {
      views?: number;
      shares?: number;
      saves?: number;
      reach?: number;
    };
  }>({
    projectId: 0,
    projectTitle: '',
    client: '',
    contentForm: '',
    contentBucket: '',
    numberOfContent: 1,
    link: '',
    caption: '',
    feedback: '',
    comments: '',
    numberOfLikes: 0,
    liveLink: '',
    platform: '',
    scheduledDate: '',
    postedDate: '',
    status: 'draft',
    analytics: {}
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Save to localStorage whenever data changes - REMOVED as requested
  // useEffect(() => {
  //   saveToLocalStorage('projects', projects);
  // }, [projects]);

  // useEffect(() => {
  //   saveToLocalStorage('clients', clients);
  // }, [clients]);

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'editor_review': return 'bg-blue-100 text-blue-800';
      case 'client_review': return 'bg-yellow-100 text-yellow-800';
      case 'needs_revision': return 'bg-red-100 text-red-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'final_delivered': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case 'draft': return <Edit className="w-4 h-4 text-gray-600" />;
      case 'editor_review': return <Eye className="w-4 h-4 text-blue-600" />;
      case 'client_review': return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'needs_revision': return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'approved': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'final_delivered': return <CheckCircle className="w-4 h-4 text-purple-600" />;
      default: return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4" />;
      case 'image': return <Image className="w-4 h-4" />;
      case 'text': return <FileText className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTypeLabel = (type: ContentType) => {
    switch (type) {
      case 'video': return 'Video Content';
      case 'image': return 'Image Content';
      case 'text': return 'Text/Captions';
      default: return type;
    }
  };

  const getFilteredAndSortedProjects = () => {
    let filtered = projects;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(project => project.type === filterType);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(project => project.status === filterStatus);
    }

    // Sort projects
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'dueDate':
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'client':
          return a.client.localeCompare(b.client);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'type':
          return a.type.localeCompare(b.type);
        default:
          return 0;
      }
    });

    return filtered;
  };

  // Calculate real dashboard statistics
  const getDashboardStats = () => {
    const totalProjects = projects.length;
    const pendingReview = projects.filter(p => p.status === 'client_review').length;
    const completedThisMonth = projects.filter(p => {
      const projectDate = new Date(p.dueDate);
      const currentDate = new Date();
      return p.status === 'approved' && 
             projectDate.getMonth() === currentDate.getMonth() && 
             projectDate.getFullYear() === currentDate.getFullYear();
    }).length;
    const activeClients = clients.length;

    return {
      totalProjects,
      pendingReview,
      completedThisMonth,
      activeClients
    };
  };



  const handleNewProject = () => {
    setShowNewProjectModal(true);
  };

  const uploadToS3 = async (file: File, key: string, fileName?: string): Promise<string> => {
    try {
      // Debug S3 configuration
      console.log('S3 Debug Info:', {
        bucket: S3_BUCKET_NAME,
        region: process.env.REACT_APP_AWS_REGION || 'us-east-1',
        hasAccessKey: !!process.env.REACT_APP_AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.REACT_APP_AWS_SECRET_ACCESS_KEY,
        accessKeyLength: process.env.REACT_APP_AWS_ACCESS_KEY_ID?.length || 0,
        key: key,
        fileSize: file.size,
        fileType: file.type
      });

      if (!process.env.REACT_APP_AWS_ACCESS_KEY_ID || !process.env.REACT_APP_AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS credentials are missing. Please check your Vercel environment variables.');
      }

      console.log('Uploading to S3:', key, 'Size:', file.size);
      
      // Update progress - converting file
      if (fileName) {
        setUploadProgress(prev => ({...prev, [fileName]: 25}));
      }
      
      // Convert file to ArrayBuffer for better compatibility
      const arrayBuffer = await file.arrayBuffer();
      
      // Update progress - preparing upload
      if (fileName) {
        setUploadProgress(prev => ({...prev, [fileName]: 50}));
      }
      
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: file.type,
      });

      console.log('Sending to S3 with command:', {
        Bucket: S3_BUCKET_NAME,
        Key: key,
        ContentType: file.type,
        BodySize: arrayBuffer.byteLength
      });
      
      // Update progress - uploading
      if (fileName) {
        setUploadProgress(prev => ({...prev, [fileName]: 75}));
      }

      await s3Client.send(command);
      
      // Update progress - complete
      if (fileName) {
        setUploadProgress(prev => ({...prev, [fileName]: 100}));
      }
      
      const fileUrl = `https://${S3_BUCKET_NAME}.s3.${process.env.REACT_APP_AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
      console.log('Upload successful:', fileUrl);
      
      return fileUrl;
    } catch (error) {
      console.error('S3 upload error details:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        code: (error as any)?.Code || 'No code',
        statusCode: (error as any)?.$metadata?.httpStatusCode || 'No status code'
      });
      throw new Error(`S3 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleFileUpload = async (projectId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    console.log('Starting file upload...', files.length, 'files');
    setIsUploading(true);
    
    // Initialize progress tracking
    const fileNames = Array.from(files).map(file => file.name);
    setUploadingFiles(fileNames);
    const initialProgress: {[key: string]: number} = {};
    fileNames.forEach(name => initialProgress[name] = 0);
    setUploadProgress(initialProgress);
    
    const newFiles: ProjectFile[] = [];
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const s3Key = `projects/${projectId}/${fileId}-${file.name}`;
        
        // S3 upload only - no fallback to local storage
        if (!process.env.REACT_APP_AWS_ACCESS_KEY_ID || !process.env.REACT_APP_AWS_SECRET_ACCESS_KEY) {
          throw new Error('AWS credentials not configured. Please set up your .env file with valid AWS credentials.');
        }
        
        // Update progress to show starting upload
        setUploadProgress(prev => ({...prev, [file.name]: 10}));
        
        const fileUrl = await uploadToS3(file, s3Key, file.name);
        
        // Get current project to check existing files
        const currentProject = projects.find(p => p.id === projectId);
        const existingFiles = currentProject?.files || [];
        
        // Generate version number
        const version = getNextVersion(existingFiles, file.name);
        


        const newFile: ProjectFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          uploadDate: new Date().toDateString(),
          url: fileUrl,
          s3Key: s3Key,
          version: version,
          uploadedBy: currentUser.name,
          isLatest: true,
          previousVersionId: getLatestFileVersion(existingFiles, file.name)?.id
        };
        
        newFiles.push(newFile);
        
        // Save file record to Supabase
        await saveFileToSupabase(projectId, newFile);
      }

      // Update the project with version-managed files
      setProjects(prev => prev.map(project => 
        project.id === projectId 
          ? { 
              ...project, 
              files: [
                // Keep existing files (with updated isLatest flags)
                ...(project.files?.map(f => {
                  const hasNewVersion = newFiles.some(nf => nf.name === f.name);
                  return hasNewVersion ? { ...f, isLatest: false } : f;
                }) || []),
                // Add new files
                ...newFiles
              ],
              lastActivity: newFiles.length === 1 
                ? `${newFiles[0].name} v${newFiles[0].version} uploaded`
                : `${newFiles.length} files uploaded`
            }
          : project
      ));

      // Update selected project if it's the one being updated
      if (selectedProject && selectedProject.id === projectId) {
        setSelectedProject(prev => prev ? {
          ...prev,
          files: [...(prev.files || []), ...newFiles],
          lastActivity: `${newFiles.length} file${newFiles.length > 1 ? 's' : ''} uploaded`
        } : null);
      }

      // Show success message
      alert(`Successfully uploaded ${newFiles.length} file${newFiles.length > 1 ? 's' : ''} to S3 cloud storage!`);
      
    } catch (error) {
      console.error('S3 upload error:', error);
      alert(`S3 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}. Check your AWS credentials and try again.`);
    } finally {
      // Reset upload state
      setIsUploading(false);
      setUploadingFiles([]);
      setUploadProgress({});
    }
  };

  const deleteFromS3 = async (s3Key: string) => {
    try {
      const command = new DeleteObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
      });
      await s3Client.send(command);
    } catch (error) {
      console.error('S3 delete error:', error);
    }
  };

  const deleteFile = async (projectId: number, fileId: string) => {
    // Find the file to clean up
    const project = projects.find(p => p.id === projectId);
    const fileToDelete = project?.files?.find(f => f.id === fileId);
    
    if (fileToDelete && fileToDelete.s3Key) {
      // Delete from S3 - all files should have s3Key now
        try {
          await deleteFromS3(fileToDelete.s3Key);
        } catch (error) {
          console.error('Failed to delete from S3:', error);
        alert('Failed to delete file from S3. Please try again.');
        return; // Don't update UI if S3 delete failed
      }
    }

    // Update projects state
    setProjects(prev => prev.map(project => 
      project.id === projectId 
        ? { 
            ...project, 
            files: project.files?.filter(f => f.id !== fileId) || [],
            lastActivity: 'File deleted'
          }
        : project
    ));

    // Update selected project if it's the one being updated
    if (selectedProject && selectedProject.id === projectId) {
      setSelectedProject(prev => prev ? {
        ...prev,
        files: prev.files?.filter(f => f.id !== fileId) || [],
        lastActivity: 'File deleted'
      } : null);
    }
  };

  const updateProjectStatus = async (projectId: number, status: ProjectStatus) => {
    try {
      // Update in Supabase database
      const { error } = await supabase
        .from('projects')
        .update({ 
          status: status,
          last_activity: 'Status updated'
        })
        .eq('id', projectId);
      
      if (error) throw error;
      
      // Update local state
      setProjects(prev => prev.map(project => 
        project.id === projectId 
          ? { ...project, status, lastActivity: 'Status updated' }
          : project
      ));
      
      // Also update selectedProject if it's the one being updated
      if (selectedProject && selectedProject.id === projectId) {
        setSelectedProject(prev => prev ? { ...prev, status, lastActivity: 'Status updated' } : null);
      }
    } catch (error) {
      console.error('Error updating project status:', error);
      alert('Failed to update project status. Please try again.');
    }
  };

  const saveFeedback = async (projectId: number) => {
    if (!feedbackInput.trim()) return;
    
    try {
      // Update in Supabase database
      const { error } = await supabase
        .from('projects')
        .update({ 
          feedback: feedbackInput.trim(),
          last_activity: 'Feedback added'
        })
        .eq('id', projectId);
      
      if (error) throw error;
      
      // Update projects array
      setProjects(prev => prev.map(project => 
        project.id === projectId 
          ? { ...project, feedback: feedbackInput.trim(), lastActivity: 'Feedback added' }
          : project
      ));
      
      // Update selectedProject if it's the one being updated
      if (selectedProject && selectedProject.id === projectId) {
        setSelectedProject(prev => prev ? { 
          ...prev, 
          feedback: feedbackInput.trim(), 
          lastActivity: 'Feedback added' 
        } : null);
      }
      
      // Reset feedback input state
      setShowFeedbackInput(false);
      setFeedbackInput('');
      
      alert('Feedback saved successfully!');
    } catch (error) {
      console.error('Error saving feedback:', error);
      alert('Failed to save feedback. Please try again.');
    }
  };

  const deleteProjectFromSupabase = async (projectId: number): Promise<void> => {
  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
};

const deleteProject = async (projectId: number) => {
  try {
    await deleteProjectFromSupabase(projectId);
    setProjects(prev => prev.filter(project => project.id !== projectId));
    if (selectedProject?.id === projectId) {
      setSelectedProject(null);
    }
    alert('Project deleted successfully!');
  } catch (error) {
    console.error('Failed to delete project:', error);
    alert('Failed to delete project. Please try again.');
  }
};

  const saveNewClient = async () => {
    if (!newClient.name || !newClient.email || !newClient.company) return;
    
    try {
      const client = await saveClientToSupabase({
      name: newClient.name,
      email: newClient.email,
      company: newClient.company,
      phone: newClient.phone,
        projects: []
      });
    
    setClients([...clients, client]);
    setNewClient({ name: '', email: '', company: '', phone: '' });
    setShowNewClientModal(false);
      alert('Client added successfully!');
    } catch (error) {
      console.error('Failed to save client:', error);
      alert('Failed to add client. Please try again.');
    }
  };

  const deleteClient = async (clientId: number) => {
    try {
      await deleteClientFromSupabase(clientId);
    setClients(prev => prev.filter(client => client.id !== clientId));
      alert('Client deleted successfully!');
    } catch (error) {
      console.error('Failed to delete client:', error);
      alert('Failed to delete client. Please try again.');
    }
  };

  const editClient = (client: Client) => {
    setSelectedClient(client);
    setNewClient({
      name: client.name,
      email: client.email,
      company: client.company,
      phone: client.phone || ''
    });
    setShowEditClientModal(true);
  };

  const updateClient = async () => {
    if (!selectedClient || !newClient.name || !newClient.email || !newClient.company) return;
    
    try {
      await updateClientInSupabase(selectedClient.id, {
        name: newClient.name,
        email: newClient.email,
        company: newClient.company,
        phone: newClient.phone
      });
    
    setClients(prev => prev.map(client => 
      client.id === selectedClient.id 
        ? { ...client, name: newClient.name, email: newClient.email, company: newClient.company, phone: newClient.phone }
        : client
    ));
    
    setNewClient({ name: '', email: '', company: '', phone: '' });
    setSelectedClient(null);
    setShowEditClientModal(false);
      alert('Client updated successfully!');
    } catch (error) {
      console.error('Failed to update client:', error);
      alert('Failed to update client. Please try again.');
    }
  };

  const editProject = (project: Project) => {
    setEditingProject(project);
    setNewProject({
      client: project.client,
      title: project.title,
      type: project.type,
      subtype: project.subtype || '',
      priority: project.priority,
      dueDate: project.dueDate,
      estimatedHours: project.estimatedHours || 0,
      budget: project.budget || 0,
      description: project.description,
      objectives: project.objectives || '',
      targetAudience: project.targetAudience || '',
      platforms: project.platforms || [],
      deliverables: project.deliverables || '',
      tags: project.tags || []
    });
    setShowEditProjectModal(true);
  };

  const updateProject = async () => {
    if (!editingProject || !newProject.client || !newProject.title || !newProject.dueDate || !newProject.description) {
      alert('Please fill in all required fields: Client, Title, Due Date, and Description');
      return;
    }
    
    try {
      await updateProjectInSupabase(editingProject.id, {
        client: newProject.client,
        title: newProject.title,
        type: newProject.type,
        subtype: newProject.subtype,
        priority: newProject.priority,
        dueDate: newProject.dueDate,
        estimatedHours: newProject.estimatedHours,
        budget: newProject.budget,
        description: newProject.description,
        objectives: newProject.objectives,
        targetAudience: newProject.targetAudience,
        platforms: newProject.platforms,
        deliverables: newProject.deliverables,
        tags: newProject.tags
      });
    
      // Update local state
      setProjects(prev => prev.map(project => 
        project.id === editingProject.id 
          ? { 
              ...project, 
              client: newProject.client,
              title: newProject.title,
              type: newProject.type,
              subtype: newProject.subtype,
              priority: newProject.priority,
              dueDate: newProject.dueDate,
              estimatedHours: newProject.estimatedHours,
              budget: newProject.budget,
              description: newProject.description,
              objectives: newProject.objectives,
              targetAudience: newProject.targetAudience,
              platforms: newProject.platforms,
              deliverables: newProject.deliverables,
              tags: newProject.tags,
              lastActivity: 'Project updated'
            }
          : project
      ));

      // Update selected project if it's the one being edited
      if (selectedProject && selectedProject.id === editingProject.id) {
        setSelectedProject(prev => prev ? {
          ...prev,
          client: newProject.client,
          title: newProject.title,
          type: newProject.type,
          subtype: newProject.subtype,
          priority: newProject.priority,
          dueDate: newProject.dueDate,
          estimatedHours: newProject.estimatedHours,
          budget: newProject.budget,
          description: newProject.description,
          objectives: newProject.objectives,
          targetAudience: newProject.targetAudience,
          platforms: newProject.platforms,
          deliverables: newProject.deliverables,
          tags: newProject.tags,
          lastActivity: 'Project updated'
        } : null);
      }
    
      // Reset form and close modal
      setNewProject({
        client: '',
        title: '',
        type: 'video',
        subtype: '',
        priority: 'medium',
        dueDate: '',
        estimatedHours: 0,
        budget: 0,
        description: '',
        objectives: '',
        targetAudience: '',
        platforms: [],
        deliverables: '',
        tags: []
      });
      setEditingProject(null);
      setShowEditProjectModal(false);
      alert('Project updated successfully!');
    } catch (error) {
      console.error('Failed to update project:', error);
      alert('Failed to update project. Please try again.');
    }
  };

  const createNewPost = (project: Project) => {
    const today = getTodayLocal(); // Get current date in YYYY-MM-DD format
    setNewPost({
      projectId: project.id,
      projectTitle: project.title,
      client: project.client,
      contentForm: project.type,
      contentBucket: '',
      numberOfContent: 1,
      link: '',
      caption: '',
      feedback: '',
      comments: '',
      numberOfLikes: 0,
      liveLink: '',
      platform: project.platforms?.[0] || '',
      scheduledDate: today,
      postedDate: today,
      status: 'draft',
      analytics: {}
    });
    setShowNewPostModal(true);
  };

  const saveNewPost = async () => {
    if (!newPost.projectTitle || !newPost.client) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      const savedPost = await savePostedContentToSupabase(newPost);
      setPostedContent(prev => [savedPost, ...prev]);
      
      // Reset form and close modal
      setNewPost({
        projectId: 0,
        projectTitle: '',
        client: '',
        contentForm: '',
        contentBucket: '',
        numberOfContent: 1,
        link: '',
        caption: '',
        feedback: '',
        comments: '',
        numberOfLikes: 0,
        liveLink: '',
        platform: '',
        scheduledDate: '',
        postedDate: '',
        status: 'draft',
        analytics: {}
      });
      setShowNewPostModal(false);
      alert('Post created successfully!');
    } catch (error) {
      console.error('Failed to save post:', error);
      alert('Failed to save post. Please try again.');
    }
  };

  // Helper to get today's date as YYYY-MM-DD in local time (no timezone conversions)
  const getTodayLocal = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to format dates for display (MM/DD/YYYY) without timezone shifts
  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return '';
    // Prefer pure string conversion when value is YYYY-MM-DD
    const yyyyMmDd = /^\d{4}-\d{2}-\d{2}$/;
    if (yyyyMmDd.test(dateString)) {
      const [y, m, d] = dateString.split('-');
      return `${m}/${d}/${y}`;
    }
    // Fallback for other formats
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const editPost = (post: PostedContent) => {
    setSelectedPost(post);
    
    // Format dates properly for the form inputs - handle timezone correctly
    const formatDateForInput = (dateString: string) => {
      if (!dateString) return '';
      try {
        // If it's already in YYYY-MM-DD format, return as is
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
          return dateString;
        }
        
        // For other formats, parse and format in local timezone
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch {
        return '';
      }
    };
    
    setNewPost({
      projectId: post.projectId,
      projectTitle: post.projectTitle,
      client: post.client,
      contentForm: post.contentForm,
      contentBucket: post.contentBucket,
      numberOfContent: post.numberOfContent,
      link: post.link,
      caption: post.caption,
      feedback: post.feedback,
      comments: post.comments,
      numberOfLikes: post.numberOfLikes,
      liveLink: post.liveLink,
      platform: post.platform,
      scheduledDate: formatDateForInput(post.scheduledDate),
      postedDate: formatDateForInput(post.postedDate),
      status: post.status,
      analytics: post.analytics
    });
    setShowEditPostModal(true);
  };

  const deletePost = async (postId: number) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;
    
    try {
      console.log('Attempting to delete post with ID:', postId);
      
      // First try to delete from database
      try {
        await deletePostedContentFromSupabase(postId);
        console.log('Successfully deleted from database');
      } catch (dbError) {
        console.error('Database delete failed:', dbError);
        // If database delete fails, we'll still remove from local state
      }
      
      // Always remove from local state
      setPostedContent(prev => {
        const filtered = prev.filter(post => post.id !== postId);
        console.log('Removed from local state, remaining posts:', filtered.length);
        return filtered;
      });
      
      // Close modal if it's open
      if (selectedPost && selectedPost.id === postId) {
        setShowEditPostModal(false);
        setSelectedPost(null);
      }
      
      alert('Post deleted successfully!');
    } catch (error) {
      console.error('Failed to delete post:', error);
      alert('Failed to delete post. Please try again.');
    }
  };

  const updatePost = async () => {
    if (!selectedPost || !newPost.projectTitle || !newPost.client) {
      alert('Please fill in all required fields');
      return;
    }
    
    try {
      await updatePostedContentInSupabase(selectedPost.id, newPost);
      
      // Update local state
      setPostedContent(prev => prev.map(post => 
        post.id === selectedPost.id 
          ? { ...post, ...newPost }
          : post
      ));
      
      // Reset form and close modal
      setNewPost({
        projectId: 0,
        projectTitle: '',
        client: '',
        contentForm: '',
        contentBucket: '',
        numberOfContent: 1,
        link: '',
        caption: '',
        feedback: '',
        comments: '',
        numberOfLikes: 0,
        liveLink: '',
        platform: '',
        scheduledDate: '',
        postedDate: '',
        status: 'draft',
        analytics: {}
      });
      setSelectedPost(null);
      setShowEditPostModal(false);
      alert('Post updated successfully!');
    } catch (error) {
      console.error('Failed to update post:', error);
      alert('Failed to update post. Please try again.');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatLastActivity = (lastActivity: string) => {
    // Always return clean activity messages, ignore any timestamps
    if (!lastActivity || lastActivity.includes('T') || lastActivity.includes('Z') || lastActivity.includes('+')) {
      return 'Recently updated';
    }
    return lastActivity;
  };

  // Version management helper functions
  const getNextVersion = (files: ProjectFile[], fileName: string): string => {
    const existingVersions = files
      .filter(f => f.name === fileName)
      .map(f => f.version)
      .sort((a, b) => {
        const [aMajor, aMinor] = a.split('.').map(Number);
        const [bMajor, bMinor] = b.split('.').map(Number);
        if (aMajor !== bMajor) return bMajor - aMajor;
        return bMinor - aMinor;
      });

    if (existingVersions.length === 0) return '1.0';
    
    const latestVersion = existingVersions[0];
    const [major, minor] = latestVersion.split('.').map(Number);
    return `${major}.${minor + 1}`;
  };

  const getLatestFileVersion = (files: ProjectFile[], fileName: string): ProjectFile | null => {
    const fileVersions = files.filter(f => f.name === fileName);
    return fileVersions.find(f => f.isLatest) || null;
  };

  const getStatusDisplayName = (status: ProjectStatus): string => {
    const statusNames = {
      'draft': 'Draft',
      'editor_review': 'Editor Review',
      'client_review': 'Client Review',
      'needs_revision': 'Needs Revision',
      'approved': 'Approved',
      'final_delivered': 'Final Delivered'
    };
    return statusNames[status];
  };

  const getNextWorkflowStatus = (currentStatus: ProjectStatus): ProjectStatus => {
    const workflow = {
      'draft': 'editor_review',
      'editor_review': 'client_review',
      'client_review': 'approved',
      'needs_revision': 'editor_review',
      'approved': 'final_delivered',
      'final_delivered': 'final_delivered'
    } as const;
    return workflow[currentStatus];
  };



  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleFileUpload(projectId, files);
    }
  };

  const downloadAllFilesAsZip = async (project: Project) => {
    if (!project.files || project.files.length === 0) {
      alert('No files to download in this project.');
      return;
    }

    try {
      const zip = new JSZip();
      const projectFolder = zip.folder(`${project.client} - ${project.title}`);
      
      // Create a loading indicator
      const loadingMessage = `Preparing ${project.files.length} files for download...`;
      console.log(loadingMessage);

      for (let i = 0; i < project.files.length; i++) {
        const file = project.files[i];
        
        try {
          // Fetch the file content
          const response = await fetch(file.url!);
          if (response.ok) {
            const blob = await response.blob();
            
            // Add file to ZIP with organized naming
            const fileName = `${i + 1}_${file.name}`;
            projectFolder?.file(fileName, blob);
          } else {
            console.warn(`Failed to download file: ${file.name}`);
          }
        } catch (error) {
          console.warn(`Error downloading file ${file.name}:`, error);
        }
      }

      // Generate and download the ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipFileName = `${project.client.replace(/[^a-zA-Z0-9]/g, '_')}_${project.title.replace(/[^a-zA-Z0-9]/g, '_')}_Files.zip`;
      
      saveAs(zipBlob, zipFileName);
      alert(`Successfully downloaded ${project.files.length} files as ${zipFileName}!`);
      
    } catch (error) {
      console.error('Error creating ZIP file:', error);
      alert('Error creating ZIP file. Please try again.');
    }
  };

  const saveNewProject = async () => {
    if (!newProject.client || !newProject.title || !newProject.dueDate || !newProject.description) {
      console.log('Validation failed:', { 
        client: newProject.client, 
        title: newProject.title, 
        dueDate: newProject.dueDate, 
        description: newProject.description 
      });
      alert('Please fill in all required fields: Client, Title, Due Date, and Description');
      return;
    }
    
    try {
      console.log('Attempting to save project:', newProject);
      
      // Insert project into Supabase
      const { data, error } = await supabase
        .from('projects')
        .insert([
          {
      client: newProject.client,
      title: newProject.title,
      type: newProject.type,
            subtype: newProject.subtype,
            priority: newProject.priority,
            status: 'draft',
      version: 1,
            due_date: newProject.dueDate,
            estimated_hours: newProject.estimatedHours,
            budget: newProject.budget,
            description: newProject.description,
            objectives: newProject.objectives,
            target_audience: newProject.targetAudience,
            platforms: newProject.platforms,
            deliverables: newProject.deliverables,
      feedback: null,
            last_activity: 'Project created',
            tags: newProject.tags
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      // Convert database format to app format
      const newProjectData: Project = {
        id: data.id,
        client: data.client,
        title: data.title,
        type: data.type,
        subtype: data.subtype,
        status: data.status,
        priority: data.priority,
        version: data.version,
        dueDate: data.due_date,
        estimatedHours: data.estimated_hours,
        budget: data.budget,
        description: data.description,
        objectives: data.objectives,
        targetAudience: data.target_audience,
        platforms: data.platforms || [],
        deliverables: data.deliverables,
        feedback: data.feedback,
        lastActivity: data.last_activity,
        tags: data.tags || [],
        files: []
      };

      console.log('Project saved successfully:', newProjectData);
      
      // Add to local state
      setProjects(prev => [...prev, newProjectData]);
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Failed to save project. Please try again.');
      return;
    }
    
    // Reset form and close modal
    setNewProject({
      client: '',
      title: '',
      type: 'video',
      subtype: '',
      priority: 'medium',
      dueDate: '',
      estimatedHours: 0,
      budget: 0,
      description: '',
      objectives: '',
      targetAudience: '',
      platforms: [],
      deliverables: '',
      tags: []
    });
    setShowNewProjectModal(false);
  };



  const ProjectCard: React.FC<{ project: Project }> = ({ project }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
          {getTypeIcon(project.type)}
            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
              {getTypeLabel(project.type)}
            </span>
          </div>
          <h3 className="font-medium text-gray-900 text-sm sm:text-base break-words leading-tight">{project.title}</h3>
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)} ml-2`}>
          <div className="flex items-center space-x-1">
            {getStatusIcon(project.status)}
            <span className="hidden sm:inline">{getStatusDisplayName(project.status)}</span>
          </div>
        </div>
      </div>
      
      <div className="space-y-2 text-xs sm:text-sm text-gray-600">
        <div className="flex items-start space-x-2">
          <User className="w-3 h-3 sm:w-4 sm:h-4 mt-0.5 flex-shrink-0" />
          <span className="break-words leading-tight">{project.client}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span>Version {project.version}</span>
          <span>Due: {new Date(project.dueDate).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center space-x-2">
          <Upload className="w-3 h-3 sm:w-4 sm:h-4" />
          <span>{project.files?.length || 0} file{(project.files?.length || 0) !== 1 ? 's' : ''}</span>
        </div>
        {project.feedback && (
          <div className="bg-gray-50 p-2 rounded text-xs">
            <strong>Latest feedback:</strong> <span className="break-words leading-tight">{project.feedback}</span>
          </div>
        )}
        <div className="text-xs text-gray-400">
          {formatLastActivity(project.lastActivity)}
        </div>
      </div>
      
      <div className="mt-3 flex space-x-1 sm:space-x-2">
        <button 
          onClick={() => setSelectedProject(project)}
          className="flex-1 bg-blue-600 text-white px-2 sm:px-3 py-1 rounded text-xs sm:text-sm hover:bg-blue-700 transition-colors flex items-center justify-center space-x-1"
        >
          <Eye className="w-3 h-3" />
          <span>View</span>
        </button>
        <button 
          onClick={() => editProject(project)}
          className="px-2 sm:px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 transition-colors"
          title="Edit Project"
        >
          <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
        <button 
          onClick={async () => await updateProjectStatus(project.id, project.status === 'approved' ? 'client_review' : 'approved')}
          className="px-2 sm:px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 transition-colors"
          title="Toggle Status"
        >
          <CheckCircle className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
        <button 
          onClick={() => deleteProject(project.id)}
          className="px-2 sm:px-3 py-1 border border-red-300 rounded text-sm hover:bg-red-50 transition-colors text-red-600"
          title="Delete Project"
        >
          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );

  // Show loading state while data is being fetched
  if (loading) {
    return (
      <div className="bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3 sm:py-4">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Content Hub</h1>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button 
                onClick={() => {
                  if (projects.length === 0) {
                    alert('Please create a project first before uploading files.');
                    return;
                  }
                  
                  if (selectedProject) {
                    fileInputRef.current?.click();
                  } else {
                    // Show project selector
                    const projectNames = projects.map((p, i) => `${i + 1}. ${p.title} (${p.client})`).join('\n');
                    const choice = prompt(`Select a project to upload files to:\n\n${projectNames}\n\nEnter the project number (1-${projects.length}):`);
                    
                    if (choice) {
                      const projectIndex = parseInt(choice) - 1;
                      if (projectIndex >= 0 && projectIndex < projects.length) {
                        setSelectedProject(projects[projectIndex]);
                        setTimeout(() => fileInputRef.current?.click(), 100);
                      } else {
                        alert('Invalid project number.');
                      }
                    }
                  }
                }}
                className="bg-green-600 text-white px-2 sm:px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-1 sm:space-x-2"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload Files</span>
                <span className="sm:hidden">Upload</span>
              </button>
              <button 
                onClick={handleNewProject}
                className="bg-blue-600 text-white px-2 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-1 sm:space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Project</span>
                <span className="sm:hidden">New</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*,image/*,text/*,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.mp4,.mov,.avi"
                className="hidden"
                onChange={async (e) => {
                  if (selectedProject && e.target.files) {
                    await handleFileUpload(selectedProject.id, e.target.files);
                    // Reset the input so the same file can be uploaded again if needed
                    e.target.value = '';
                  } else {
                    alert('Please select a project first to upload files.');
                  }
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Navigation Tabs */}
        <nav className="flex space-x-4 sm:space-x-8 mb-6 sm:mb-8 overflow-x-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
            { id: 'projects', label: 'All Projects', icon: FileText },
            { id: 'calendar', label: 'Calendar', icon: Calendar },
            { id: 'content-calendar', label: 'Content Calendar', icon: Calendar },
            { id: 'clients', label: 'Clients', icon: User }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1 sm:space-x-2 pb-2 border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-sm sm:text-base">{tab.label}</span>
            </button>
          ))}
        </nav>



        {/* Main Content */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              <div className="bg-white p-3 sm:p-6 rounded-lg border">
                <div className="flex items-center">
                  <div className="p-1 sm:p-2 bg-blue-100 rounded">
                    <FileText className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <div className="ml-2 sm:ml-4">
                    <p className="text-lg sm:text-2xl font-semibold text-gray-900">{getDashboardStats().totalProjects}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Total Projects</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-3 sm:p-6 rounded-lg border">
                <div className="flex items-center">
                  <div className="p-1 sm:p-2 bg-yellow-100 rounded">
                    <Clock className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" />
                  </div>
                  <div className="ml-2 sm:ml-4">
                    <p className="text-lg sm:text-2xl font-semibold text-gray-900">{getDashboardStats().pendingReview}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Pending Review</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-3 sm:p-6 rounded-lg border">
                <div className="flex items-center">
                  <div className="p-1 sm:p-2 bg-green-100 rounded">
                    <CheckCircle className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <div className="ml-2 sm:ml-4">
                    <p className="text-lg sm:text-2xl font-semibold text-gray-900">{getDashboardStats().completedThisMonth}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Completed This Month</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-3 sm:p-6 rounded-lg border">
                <div className="flex items-center">
                  <div className="p-1 sm:p-2 bg-purple-100 rounded">
                    <User className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" />
                  </div>
                  <div className="ml-2 sm:ml-4">
                    <p className="text-lg sm:text-2xl font-semibold text-gray-900">{getDashboardStats().activeClients}</p>
                    <p className="text-xs sm:text-sm text-gray-600">Active Clients</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Projects */}
            <div>
              <div className="mb-4">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3">Projects</h2>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
                    {/* Content Type Filter */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700 hidden sm:inline">Type:</label>
                      <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as ContentType | 'all')}
                        className="w-full sm:w-auto border border-gray-300 rounded px-2 sm:px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">All Types</option>
                        <option value="video">🎥 Video</option>
                        <option value="image">🖼️ Image</option>
                        <option value="text">📝 Text</option>
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700 hidden sm:inline">Status:</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | 'all')}
                        className="w-full sm:w-auto border border-gray-300 rounded px-2 sm:px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">All Status</option>
                        <option value="draft">📝 Draft</option>
                        <option value="editor_review">👁️ Editor Review</option>
                        <option value="client_review">📤 Client Review</option>
                        <option value="needs_revision">🔧 Needs Revision</option>
                        <option value="approved">✅ Approved</option>
                        <option value="final_delivered">🎯 Final Delivered</option>
                      </select>
                    </div>

                    {/* Sort By */}
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-medium text-gray-700 hidden sm:inline">Sort:</label>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'dueDate' | 'client' | 'status' | 'type')}
                        className="w-full sm:w-auto border border-gray-300 rounded px-2 sm:px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="dueDate">📅 Due Date</option>
                        <option value="client">👤 Client</option>
                        <option value="type">🎯 Content Type</option>
                        <option value="status">📊 Status</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {getFilteredAndSortedProjects().map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
                {getFilteredAndSortedProjects().length === 0 && (
                  <div className="col-span-full text-center py-8 text-gray-500">
                    No projects match your current filters.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">All Projects</h2>
              <div className="flex items-center space-x-4">
                {/* Content Type Filter */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Type:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as ContentType | 'all')}
                    className="border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Types</option>
                    <option value="video">🎥 Video Content</option>
                    <option value="image">🖼️ Image Content</option>
                    <option value="text">📝 Text/Captions</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Status:</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | 'all')}
                    className="border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Status</option>
                    <option value="draft">📝 Draft</option>
                    <option value="editor_review">👁️ Editor Review</option>
                    <option value="client_review">📤 Client Review</option>
                    <option value="needs_revision">🔧 Needs Revision</option>
                    <option value="approved">✅ Approved</option>
                    <option value="final_delivered">🎯 Final Delivered</option>
                  </select>
                </div>

                {/* Sort By */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Sort:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'dueDate' | 'client' | 'status' | 'type')}
                    className="border border-gray-300 rounded px-3 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="dueDate">📅 Due Date</option>
                    <option value="client">👤 Client</option>
                    <option value="type">🎯 Content Type</option>
                    <option value="status">📊 Status</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFilteredAndSortedProjects().map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
              {getFilteredAndSortedProjects().length === 0 && (
                <div className="col-span-full text-center py-8 text-gray-500">
                  No projects match your current filters.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Content Calendar</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-700">Upcoming Deadlines</h3>
                <span className="text-sm text-gray-500">{new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
              </div>
              
              <div className="space-y-3">
                {projects
                  .filter(project => new Date(project.dueDate) >= new Date())
                  .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                  .map((project) => {
                    const daysUntilDue = Math.ceil((new Date(project.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    const isUrgent = daysUntilDue <= 3;
                    const isOverdue = daysUntilDue < 0;
                    
                    return (
                      <div key={project.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                        isOverdue ? 'bg-red-50 border-red-200' : 
                        isUrgent ? 'bg-yellow-50 border-yellow-200' : 
                        'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-start space-x-3">
                          {getTypeIcon(project.type)}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 break-words leading-tight">{project.title}</p>
                            <p className="text-sm text-gray-600 break-words leading-tight">{project.client}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                            {getStatusDisplayName(project.status)}
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-medium ${
                              isOverdue ? 'text-red-600' : 
                              isUrgent ? 'text-yellow-600' : 
                              'text-gray-900'
                            }`}>
                              {new Date(project.dueDate).toLocaleDateString()}
                            </p>
                            <p className={`text-xs ${
                              isOverdue ? 'text-red-500' : 
                              isUrgent ? 'text-yellow-500' : 
                              'text-gray-500'
                            }`}>
                              {isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : 
                               daysUntilDue === 0 ? 'Due today' :
                               `${daysUntilDue} days left`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                
                {projects.filter(project => new Date(project.dueDate) >= new Date()).length === 0 && (
                  <p className="text-center text-gray-500 py-8">No upcoming deadlines</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'content-calendar' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Content Calendar</h2>
              <button 
                onClick={() => {
                  const today = getTodayLocal();
                  setNewPost({
                    projectId: 0,
                    projectTitle: '',
                    client: '',
                    contentForm: '',
                    contentBucket: '',
                    numberOfContent: 1,
                    link: '',
                    caption: '',
                    feedback: '',
                    comments: '',
                    numberOfLikes: 0,
                    liveLink: '',
                    platform: '',
                    scheduledDate: today,
                    postedDate: today,
                    status: 'draft',
                    analytics: {}
                  });
                  setShowNewPostModal(true);
                }}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Post</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {postedContent.map((post) => (
                <div key={post.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 text-sm break-words leading-tight">{post.projectTitle}</h3>
                      <p className="text-xs text-gray-600 break-words leading-tight">{post.client}</p>
                    </div>
                    <div className="flex space-x-1">
                      <button 
                        onClick={() => editPost(post)}
                        className="p-1 text-gray-400 hover:text-blue-600"
                        title="Edit post"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          console.log('Delete button clicked for post ID:', post.id);
                          deletePost(post.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 border border-red-200 hover:border-red-400 rounded"
                        title="Delete post"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Platform:</span>
                      <span>{post.platform || 'Not set'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        post.status === 'posted' ? 'bg-green-100 text-green-800' :
                        post.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {post.status}
                      </span>
                    </div>
                    {post.scheduledDate && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Scheduled:</span>
                        <span>{formatDateForDisplay(post.scheduledDate)}</span>
                      </div>
                    )}
                    {post.postedDate && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Posted:</span>
                        <span>{formatDateForDisplay(post.postedDate)}</span>
                      </div>
                    )}
                    {post.numberOfLikes > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Likes:</span>
                        <span>{post.numberOfLikes}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {postedContent.length === 0 && (
                <div className="col-span-full text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p>No posts scheduled yet</p>
                  <p className="text-sm">Create your first post to get started</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'clients' && (
          <div>
            {!clientsUnlocked ? (
              // Password Protection Screen
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md w-full">
                  <div className="text-center mb-6">
                    <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Client Management</h2>
                    <p className="text-gray-600">This section is password protected</p>
                  </div>
                  
                  <form onSubmit={handleClientPasswordSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                        Enter Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Password"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Access Clients
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              // Original Client Management Content
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Client Management</h2>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => setClientsUnlocked(false)}
                      className="text-gray-500 hover:text-gray-700 px-3 py-1 text-sm"
                      title="Lock clients section"
                    >
                      🔒 Lock
                    </button>
                    <button 
                      onClick={() => setShowNewClientModal(true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>New Client</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clients.map((client) => (
                    <div key={client.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <User className="w-5 h-5 text-blue-600" />
                          <h3 className="font-medium text-gray-900">{client.name}</h3>
                        </div>
                        <div className="flex space-x-1">
                          <button 
                            onClick={() => editClient(client)}
                            className="p-1 text-gray-400 hover:text-blue-600"
                            title="Edit client"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteClient(client.id)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Delete client"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Company:</span>
                          <span>{client.company}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Email:</span>
                          <a href={`mailto:${client.email}`} className="text-blue-600 hover:underline">
                            {client.email}
                          </a>
                        </div>
                        {client.phone && (
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">Phone:</span>
                            <a href={`tel:${client.phone}`} className="text-blue-600 hover:underline">
                              {client.phone}
                            </a>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs text-gray-400">
                            {client.projects.length} project{client.projects.length !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs text-gray-400">
                            Since {new Date(client.createdDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Project Detail Modal */}
      {selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-2 sm:p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate pr-4">{selectedProject.title}</h2>
                <button
                  onClick={() => setSelectedProject(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Client:</span>
                    <p>{selectedProject.client}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Due Date:</span>
                    <p>{selectedProject.dueDate}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Version:</span>
                    <p>{selectedProject.version}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Status:</span>
                    <div className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedProject.status)}`}>
                      {selectedProject.status.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                
                {/* Feedback Section */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">Latest Feedback:</span>
                    <button
                      onClick={() => {
                        if (!showFeedbackInput) {
                          setFeedbackInput(selectedProject.feedback || '');
                        }
                        setShowFeedbackInput(!showFeedbackInput);
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      {showFeedbackInput ? 'Cancel' : (selectedProject.feedback ? 'Edit' : 'Add Feedback')}
                    </button>
                  </div>
                  
                  {showFeedbackInput ? (
                    <div className="space-y-2">
                      <textarea
                        value={feedbackInput}
                        onChange={(e) => setFeedbackInput(e.target.value)}
                        placeholder="Enter your feedback here..."
                        className="w-full p-3 border border-gray-300 rounded-lg resize-none"
                        rows={3}
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={async () => await saveFeedback(selectedProject.id)}
                          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                        >
                          Save Feedback
                        </button>
                        <button
                          onClick={() => {
                            setShowFeedbackInput(false);
                            setFeedbackInput('');
                          }}
                          className="bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {selectedProject.feedback ? (
                        <div className="bg-gray-50 p-3 rounded-lg mt-1">
                          {selectedProject.feedback}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm mt-1">No feedback yet</p>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Files Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-700">Project Files ({selectedProject.files?.length || 0})</h3>
                    <div className="flex space-x-2">
                      <input
                        type="file"
                        multiple
                        accept="video/*,image/*,text/*,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.mp4,.mov,.avi"
                        className="hidden"
                        id={`file-upload-${selectedProject.id}`}
                        onChange={async (e) => {
                          await handleFileUpload(selectedProject.id, e.target.files);
                          // Reset the input so the same files can be uploaded again if needed
                          e.target.value = '';
                        }}
                      />
                      {selectedProject.files && selectedProject.files.length > 0 && (
                        <button 
                          onClick={() => downloadAllFilesAsZip(selectedProject)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 flex items-center space-x-1"
                          title="Download all files as ZIP"
                        disabled={isUploading}
                        >
                          <Download className="w-3 h-3" />
                          <span>Download ZIP</span>
                        </button>
                      )}
                      <button 
                        onClick={() => document.getElementById(`file-upload-${selectedProject.id}`)?.click()}
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-1"
                        disabled={isUploading}
                      >
                        <Upload className="w-3 h-3" />
                        <span>{isUploading ? 'Uploading...' : 'Add Files'}</span>
                      </button>
                    </div>
                  </div>
                  
                                    {selectedProject.files && selectedProject.files.length > 0 ? (
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {selectedProject.files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                          <div className="flex items-center space-x-2 flex-1">
                            {file.type.startsWith('image/') ? <Image className="w-4 h-4" /> : 
                             file.type.startsWith('video/') ? <Video className="w-4 h-4" /> : 
                             <FileText className="w-4 h-4" />}
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <span className={`text-xs px-2 py-1 rounded-full ${file.isLatest ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                  v{file.version}
                                </span>
                                {file.isLatest && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Latest</span>}
                              </div>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(file.size)} • {new Date(file.uploadDate).toLocaleDateString()}
                                {file.uploadedBy && ` • by ${file.uploadedBy}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            {file.url && (
                              <a 
                                href={file.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 p-1"
                                title="View file"
                              >
                                <Eye className="w-3 h-3" />
                              </a>
                            )}
                            <button 
                              onClick={() => deleteFile(selectedProject.id, file.id)}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Delete file"
                            >
                              <X className="w-3 h-3" />
                    </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div 
                      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors"
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, selectedProject.id)}
                    >
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500 mb-2">No files uploaded yet</p>
                      <p className="text-xs text-gray-400">Drag and drop files here or click "Add Files" button</p>
                    </div>
                  )}

                  {/* Upload Progress */}
                  {isUploading && uploadingFiles.length > 0 && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center mb-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2"></div>
                        <h4 className="font-medium text-blue-900">
                          Uploading {uploadingFiles.length} file{uploadingFiles.length > 1 ? 's' : ''}...
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {uploadingFiles.map((fileName) => (
                          <div key={fileName} className="bg-white rounded p-3 border border-blue-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700 truncate">{fileName}</span>
                              <span className="text-xs text-blue-600 font-medium">{uploadProgress[fileName] || 0}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${uploadProgress[fileName] || 0}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="border-t pt-4">
                  <h3 className="font-medium text-gray-700 mb-2">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => editProject(selectedProject)}
                      className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 flex items-center space-x-1"
                    >
                      <Edit className="w-3 h-3" />
                      <span>Edit Project</span>
                    </button>
                    {selectedProject.status === 'final_delivered' && (
                      <button 
                        onClick={() => createNewPost(selectedProject)}
                        className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Create Post</span>
                      </button>
                    )}
                    <div className="flex items-center space-x-2">
                      <select 
                        value={selectedProject.status} 
                        onChange={async (e) => await updateProjectStatus(selectedProject.id, e.target.value as ProjectStatus)}
                        className="border border-gray-300 px-3 py-2 rounded text-sm"
                      >
                        <option value="draft">Draft</option>
                        <option value="editor_review">Editor Review</option>
                        <option value="client_review">Client Review</option>
                        <option value="needs_revision">Needs Revision</option>
                        <option value="approved">Approved</option>
                        <option value="final_delivered">Final Delivered</option>
                      </select>
                      
                      {/* Quick workflow action buttons */}
                      {selectedProject.status !== 'final_delivered' && (
                        <button
                          onClick={async () => await updateProjectStatus(selectedProject.id, getNextWorkflowStatus(selectedProject.status))}
                          className="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700"
                        >
                          {selectedProject.status === 'draft' ? 'Send to Review' :
                           selectedProject.status === 'editor_review' ? 'Send to Client' :
                           selectedProject.status === 'client_review' ? 'Approve' :
                           selectedProject.status === 'needs_revision' ? 'Resubmit' :
                           selectedProject.status === 'approved' ? 'Mark Final' : 'Next'}
                        </button>
                      )}
                      
                      {(selectedProject.status === 'editor_review' || selectedProject.status === 'client_review') && (
                        <button
                          onClick={async () => await updateProjectStatus(selectedProject.id, 'needs_revision')}
                          className="bg-yellow-600 text-white px-3 py-2 rounded text-sm hover:bg-yellow-700"
                        >
                          Request Changes
                        </button>
                      )}
                    </div>
                    <button 
                      onClick={() => deleteProject(selectedProject.id)}
                      className="border border-red-300 text-red-600 px-4 py-2 rounded hover:bg-red-50 text-sm flex items-center space-x-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Delete Project</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Project Modal - Enhanced */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">Create New Project</h2>
                <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column - Basic Info */}
              <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Basic Information</h3>
                  
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client *
                  </label>
                  <select
                    value={newProject.client}
                    onChange={(e) => setNewProject({...newProject, client: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a client...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.company}>
                        {client.company} ({client.name})
                      </option>
                    ))}
                  </select>
                  {clients.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      No clients found. <button 
                        onClick={() => {setShowNewProjectModal(false); setShowNewClientModal(true);}}
                        className="text-blue-600 hover:underline"
                      >
                        Add a client first
                      </button>
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Title *
                  </label>
                  <input
                    type="text"
                    value={newProject.title}
                    onChange={(e) => setNewProject({...newProject, title: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Instagram Reel - Product Launch"
                  />
                </div>
                
                  <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content Type *
                  </label>
                  <select
                    value={newProject.type}
                    onChange={(e) => setNewProject({...newProject, type: e.target.value as ContentType})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="video">🎥 Video</option>
                        <option value="image">🖼️ Image</option>
                        <option value="text">📝 Text/Copy</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subtype
                      </label>
                      <input
                        type="text"
                        value={newProject.subtype}
                        onChange={(e) => setNewProject({...newProject, subtype: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Instagram Reel, Blog Post, etc."
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Priority
                      </label>
                      <select
                        value={newProject.priority}
                        onChange={(e) => setNewProject({...newProject, priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent'})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="low">🟢 Low</option>
                        <option value="medium">🟡 Medium</option>
                        <option value="high">🟠 High</option>
                        <option value="urgent">🔴 Urgent</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Due Date *
                  </label>
                  <input
                    type="date"
                    value={newProject.dueDate}
                    onChange={(e) => setNewProject({...newProject, dueDate: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                    </div>
                </div>
                
                  <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estimated Hours
                      </label>
                      <input
                        type="number"
                        value={newProject.estimatedHours}
                        onChange={(e) => setNewProject({...newProject, estimatedHours: parseInt(e.target.value) || 0})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Budget ($)
                      </label>
                      <input
                        type="number"
                        value={newProject.budget}
                        onChange={(e) => setNewProject({...newProject, budget: parseInt(e.target.value) || 0})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column - Detailed Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Project Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description *
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                      placeholder="Brief description of the project..."
                  />
                </div>
                
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Objectives/Goals
                    </label>
                    <textarea
                      value={newProject.objectives}
                      onChange={(e) => setNewProject({...newProject, objectives: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                      placeholder="What's the goal? Drive sales, increase awareness, etc."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      value={newProject.targetAudience}
                      onChange={(e) => setNewProject({...newProject, targetAudience: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Cannabis enthusiasts, 25-45 years old"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Platforms
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Instagram', 'TikTok', 'Facebook', 'Twitter', 'YouTube', 'LinkedIn'].map((platform) => (
                        <label key={platform} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={newProject.platforms.includes(platform)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewProject({...newProject, platforms: [...newProject.platforms, platform]});
                              } else {
                                setNewProject({...newProject, platforms: newProject.platforms.filter(p => p !== platform)});
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{platform}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Deliverables
                    </label>
                    <textarea
                      value={newProject.deliverables}
                      onChange={(e) => setNewProject({...newProject, deliverables: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                      placeholder="What exactly will be delivered? e.g., 3 video versions, captions, thumbnails"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tags
                    </label>
                    <input
                      type="text"
                      value={newProject.tags.join(', ')}
                      onChange={(e) => setNewProject({...newProject, tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag)})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., product-launch, thca, social-media (comma separated)"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
                  <button
                  onClick={() => setShowNewProjectModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                  Cancel
                  </button>
                  <button
                  onClick={saveNewProject}
                  disabled={!newProject.client || !newProject.title || !newProject.dueDate || !newProject.description}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                  Create Project
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProjectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">Edit Project</h2>
                <button
                  onClick={() => {
                    setShowEditProjectModal(false);
                    setEditingProject(null);
                    setNewProject({
                      client: '',
                      title: '',
                      type: 'video',
                      subtype: '',
                      priority: 'medium',
                      dueDate: '',
                      estimatedHours: 0,
                      budget: 0,
                      description: '',
                      objectives: '',
                      targetAudience: '',
                      platforms: [],
                      deliverables: '',
                      tags: []
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column - Basic Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Basic Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client *
                    </label>
                    <select
                      value={newProject.client}
                      onChange={(e) => setNewProject({...newProject, client: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select a client...</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.company}>
                          {client.company} ({client.name})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Title *
                    </label>
                    <input
                      type="text"
                      value={newProject.title}
                      onChange={(e) => setNewProject({...newProject, title: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Instagram Reel - Product Launch"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content Type *
                      </label>
                      <select
                        value={newProject.type}
                        onChange={(e) => setNewProject({...newProject, type: e.target.value as ContentType})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="video">🎥 Video</option>
                        <option value="image">🖼️ Image</option>
                        <option value="text">📝 Text/Copy</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Subtype
                      </label>
                      <input
                        type="text"
                        value={newProject.subtype}
                        onChange={(e) => setNewProject({...newProject, subtype: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Instagram Reel, Blog Post, etc."
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Priority
                      </label>
                      <select
                        value={newProject.priority}
                        onChange={(e) => setNewProject({...newProject, priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent'})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="low">🟢 Low</option>
                        <option value="medium">🟡 Medium</option>
                        <option value="high">🟠 High</option>
                        <option value="urgent">🔴 Urgent</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Due Date *
                      </label>
                      <input
                        type="date"
                        value={newProject.dueDate}
                        onChange={(e) => setNewProject({...newProject, dueDate: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Estimated Hours
                      </label>
                      <input
                        type="number"
                        value={newProject.estimatedHours}
                        onChange={(e) => setNewProject({...newProject, estimatedHours: parseInt(e.target.value) || 0})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Budget ($)
                      </label>
                      <input
                        type="number"
                        value={newProject.budget}
                        onChange={(e) => setNewProject({...newProject, budget: parseInt(e.target.value) || 0})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column - Detailed Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Project Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description *
                    </label>
                    <textarea
                      value={newProject.description}
                      onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                      placeholder="Brief description of the project..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Objectives/Goals
                    </label>
                    <textarea
                      value={newProject.objectives}
                      onChange={(e) => setNewProject({...newProject, objectives: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                      placeholder="What's the goal? Drive sales, increase awareness, etc."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      value={newProject.targetAudience}
                      onChange={(e) => setNewProject({...newProject, targetAudience: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Cannabis enthusiasts, 25-45 years old"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Platforms
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Instagram', 'TikTok', 'Facebook', 'Twitter', 'YouTube', 'LinkedIn'].map((platform) => (
                        <label key={platform} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={newProject.platforms.includes(platform)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewProject({...newProject, platforms: [...newProject.platforms, platform]});
                              } else {
                                setNewProject({...newProject, platforms: newProject.platforms.filter(p => p !== platform)});
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{platform}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Deliverables
                    </label>
                    <textarea
                      value={newProject.deliverables}
                      onChange={(e) => setNewProject({...newProject, deliverables: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                      placeholder="What exactly will be delivered? e.g., 3 video versions, captions, thumbnails"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tags
                    </label>
                    <input
                      type="text"
                      value={newProject.tags.join(', ')}
                      onChange={(e) => setNewProject({...newProject, tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag)})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., product-launch, thca, social-media (comma separated)"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
                <button
                  onClick={() => {
                    setShowEditProjectModal(false);
                    setEditingProject(null);
                    setNewProject({
                      client: '',
                      title: '',
                      type: 'video',
                      subtype: '',
                      priority: 'medium',
                      dueDate: '',
                      estimatedHours: 0,
                      budget: 0,
                      description: '',
                      objectives: '',
                      targetAudience: '',
                      platforms: [],
                      deliverables: '',
                      tags: []
                    });
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={updateProject}
                  disabled={!newProject.client || !newProject.title || !newProject.dueDate || !newProject.description}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Update Project
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      {showNewClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Add New Client</h2>
                <button
                  onClick={() => setShowNewClientModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    value={newClient.name}
                    onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Sarah Johnson"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="sarah@company.com"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company *
                  </label>
                  <input
                    type="text"
                    value={newClient.company}
                    onChange={(e) => setNewClient({...newClient, company: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Green Wellness Co"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newClient.phone}
                    onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={saveNewClient}
                    disabled={!newClient.name || !newClient.email || !newClient.company}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Add Client
                  </button>
                  <button
                    onClick={() => setShowNewClientModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Edit Client</h2>
                <button
                  onClick={() => setShowEditClientModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    value={newClient.name}
                    onChange={(e) => setNewClient({...newClient, name: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={newClient.email}
                    onChange={(e) => setNewClient({...newClient, email: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company *
                  </label>
                  <input
                    type="text"
                    value={newClient.company}
                    onChange={(e) => setNewClient({...newClient, company: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newClient.phone}
                    onChange={(e) => setNewClient({...newClient, phone: e.target.value})}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={updateClient}
                    disabled={!newClient.name || !newClient.email || !newClient.company}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Update Client
                  </button>
                  <button
                    onClick={() => setShowEditClientModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Post Modal */}
      {showNewPostModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">Create New Post</h2>
                <button
                  onClick={() => setShowNewPostModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Post Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Title *
                    </label>
                    <input
                      type="text"
                      value={newPost.projectTitle}
                      onChange={(e) => setNewPost({...newPost, projectTitle: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Strain of the Week: Super Lemon Haze"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client *
                    </label>
                    <input
                      type="text"
                      value={newPost.client}
                      onChange={(e) => setNewPost({...newPost, client: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., GreenHaus Cannabis Co."
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content Form
                      </label>
                      <input
                        type="text"
                        value={newPost.contentForm}
                        onChange={(e) => setNewPost({...newPost, contentForm: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., Video, Image, Text"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content Bucket
                      </label>
                      <input
                        type="text"
                        value={newPost.contentBucket}
                        onChange={(e) => setNewPost({...newPost, contentBucket: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., Interactive, Educational"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        # of Content
                      </label>
                      <input
                        type="number"
                        value={newPost.numberOfContent}
                        onChange={(e) => setNewPost({...newPost, numberOfContent: parseInt(e.target.value) || 1})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="1"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Platform
                      </label>
                      <select
                        value={newPost.platform}
                        onChange={(e) => setNewPost({...newPost, platform: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Platform</option>
                        <option value="Instagram">Instagram</option>
                        <option value="TikTok">TikTok</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Twitter">Twitter</option>
                        <option value="YouTube">YouTube</option>
                        <option value="LinkedIn">LinkedIn</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Scheduled Date
                      </label>
                      <input
                        type="date"
                        value={newPost.scheduledDate}
                        onChange={(e) => setNewPost({...newPost, scheduledDate: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Posted Date
                      </label>
                      <input
                        type="date"
                        value={newPost.postedDate}
                        onChange={(e) => setNewPost({...newPost, postedDate: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={newPost.status}
                      onChange={(e) => setNewPost({...newPost, status: e.target.value as PostStatus})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="posted">Posted</option>
                    </select>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Content Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Link
                    </label>
                    <input
                      type="url"
                      value={newPost.link}
                      onChange={(e) => setNewPost({...newPost, link: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Caption
                    </label>
                    <textarea
                      value={newPost.caption}
                      onChange={(e) => setNewPost({...newPost, caption: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                      placeholder="Post caption..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Feedback
                    </label>
                    <textarea
                      value={newPost.feedback}
                      onChange={(e) => setNewPost({...newPost, feedback: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                      placeholder="e.g., Have staff shoot"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Comments
                    </label>
                    <textarea
                      value={newPost.comments}
                      onChange={(e) => setNewPost({...newPost, comments: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                      placeholder="Additional comments..."
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        # of Likes
                      </label>
                      <input
                        type="number"
                        value={newPost.numberOfLikes}
                        onChange={(e) => setNewPost({...newPost, numberOfLikes: parseInt(e.target.value) || 0})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Live Link
                      </label>
                      <input
                        type="url"
                        value={newPost.liveLink}
                        onChange={(e) => setNewPost({...newPost, liveLink: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-6 border-t mt-6">
                <button
                  onClick={() => setShowNewPostModal(false)}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNewPost}
                  disabled={!newPost.projectTitle || !newPost.client}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Create Post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Post Modal */}
      {showEditPostModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-semibold text-gray-900">Edit Post</h2>
                <button
                  onClick={() => {
                    setShowEditPostModal(false);
                    setSelectedPost(null);
                    setNewPost({
                      projectId: 0,
                      projectTitle: '',
                      client: '',
                      contentForm: '',
                      contentBucket: '',
                      numberOfContent: 1,
                      link: '',
                      caption: '',
                      feedback: '',
                      comments: '',
                      numberOfLikes: 0,
                      liveLink: '',
                      platform: '',
                      scheduledDate: '',
                      postedDate: '',
                      status: 'draft',
                      analytics: {}
                    });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Post Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Project Title *
                    </label>
                    <input
                      type="text"
                      value={newPost.projectTitle}
                      onChange={(e) => setNewPost({...newPost, projectTitle: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client *
                    </label>
                    <input
                      type="text"
                      value={newPost.client}
                      onChange={(e) => setNewPost({...newPost, client: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content Form
                      </label>
                      <input
                        type="text"
                        value={newPost.contentForm}
                        onChange={(e) => setNewPost({...newPost, contentForm: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Content Bucket
                      </label>
                      <input
                        type="text"
                        value={newPost.contentBucket}
                        onChange={(e) => setNewPost({...newPost, contentBucket: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        # of Content
                      </label>
                      <input
                        type="number"
                        value={newPost.numberOfContent}
                        onChange={(e) => setNewPost({...newPost, numberOfContent: parseInt(e.target.value) || 1})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="1"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Platform
                      </label>
                      <select
                        value={newPost.platform}
                        onChange={(e) => setNewPost({...newPost, platform: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select Platform</option>
                        <option value="Instagram">Instagram</option>
                        <option value="TikTok">TikTok</option>
                        <option value="Facebook">Facebook</option>
                        <option value="Twitter">Twitter</option>
                        <option value="YouTube">YouTube</option>
                        <option value="LinkedIn">LinkedIn</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Scheduled Date
                      </label>
                      <input
                        type="date"
                        value={newPost.scheduledDate}
                        onChange={(e) => setNewPost({...newPost, scheduledDate: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Posted Date
                      </label>
                      <input
                        type="date"
                        value={newPost.postedDate}
                        onChange={(e) => setNewPost({...newPost, postedDate: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={newPost.status}
                      onChange={(e) => setNewPost({...newPost, status: e.target.value as PostStatus})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="posted">Posted</option>
                    </select>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Content Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Link
                    </label>
                    <input
                      type="url"
                      value={newPost.link}
                      onChange={(e) => setNewPost({...newPost, link: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Caption
                    </label>
                    <textarea
                      value={newPost.caption}
                      onChange={(e) => setNewPost({...newPost, caption: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-24 resize-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Feedback
                    </label>
                    <textarea
                      value={newPost.feedback}
                      onChange={(e) => setNewPost({...newPost, feedback: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Comments
                    </label>
                    <textarea
                      value={newPost.comments}
                      onChange={(e) => setNewPost({...newPost, comments: e.target.value})}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-20 resize-none"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        # of Likes
                      </label>
                      <input
                        type="number"
                        value={newPost.numberOfLikes}
                        onChange={(e) => setNewPost({...newPost, numberOfLikes: parseInt(e.target.value) || 0})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Live Link
                      </label>
                      <input
                        type="url"
                        value={newPost.liveLink}
                        onChange={(e) => setNewPost({...newPost, liveLink: e.target.value})}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between pt-6 border-t mt-6">
                <button
                  onClick={() => {
                    if (selectedPost && window.confirm('Are you sure you want to delete this post?')) {
                      deletePost(selectedPost.id);
                    }
                  }}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Post
                </button>
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowEditPostModal(false);
                      setSelectedPost(null);
                      setNewPost({
                        projectId: 0,
                        projectTitle: '',
                        client: '',
                        contentForm: '',
                        contentBucket: '',
                        numberOfContent: 1,
                        link: '',
                        caption: '',
                        feedback: '',
                        comments: '',
                        numberOfLikes: 0,
                        liveLink: '',
                        platform: '',
                        scheduledDate: '',
                        postedDate: '',
                        status: 'draft',
                        analytics: {}
                      });
                    }}
                    className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={updatePost}
                    disabled={!newPost.projectTitle || !newPost.client}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Update Post
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Export the main component
export default ContentHub;