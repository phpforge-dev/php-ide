<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/blog', name: 'blog_')]
final class BlogController extends AbstractController
{
    public function __construct(
        #[Autowire('%env(APP_SECRET)%')] private string $secret,
        #[Autowire(service: 'app.mailer')] private object $mailer,
    ) {}

    #[Route('', name: 'index', methods: ['GET'])]
    public function index(): Response
    {
        return $this->render('blog/index.html.twig');
    }

    #[Route('/{slug}', name: 'show', methods: ['GET', 'HEAD'])]
    public function show(string $slug): Response
    {
        $dir = $this->getParameter('app.upload_dir');
        return $this->redirectToRoute('blog_index');
    }

    #[\Symfony\Component\Routing\Attribute\Route(path: '/feed.xml')]
    public function feedAction(): Response
    {
        return $this->render('');
    }
}
